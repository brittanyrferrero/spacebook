# Architecture

## Multi-tenancy

> See [ADR-002](decisions/002-path-based-multi-tenancy.md) — why path-based workspaces instead of subdomains.

Spacebook uses **path-based multi-tenancy** — every workspace lives at `/[workspace]/`. The slug in the URL is the workspace identifier and doubles as the access credential (see [Auth model](#auth-model) below).

Workspace isolation is enforced at the application layer: every Supabase query filters by `workspace_id`, and every Redis key is namespaced as `ws:{workspaceId}:...`. There are no cross-workspace queries.

There are two deployed instances:
- **Demo** — runs in mock mode (in-memory data, no database)
- **Production** — real Supabase + Redis

## Auth model

> See [ADR-001](decisions/001-slug-as-secret-auth.md) — why there are no user accounts and how the slug-as-secret model works. See [ADR-007](decisions/007-token-rotation.md) — why `admin_entry_token` rotates on every use and how recovery nonces work.

Spacebook has no user accounts. Access works through tokens and cookies:

| Actor | How they get in |
|---|---|
| **End user** | Navigates to `/{workspace}` — if no session cookie, they enter the workspace slug to get one |
| **Workspace admin** | Visits `/{workspace}/admin` and enters the admin password; gets an `admin_{slug}` cookie valid for 7 days |
| **New workspace** | Creator visits `/generate`, is redirected to `/admin-enter/{slug}/{token}` to claim it; first claimer becomes `super_admin` |
| **Palantir super-admin** | Requests a magic link via email at `/palantir/enter` |
| **Booking owner** | Follows a magic link to `/{workspace}/my-bookings` — a single-use KV token verifies their email and sets an `mb_{slug}` httpOnly cookie scoped to that workspace |

Session cookies are validated against tokens stored in Redis — a slug rename immediately invalidates all existing sessions because the token changes.

Admin roles (`admin`, `super_admin`) are stored per-workspace in Redis under `ws:{workspaceId}:cfg:admins`.

The `mb_{workspace}` cookie is the only proof-of-identity Spacebook issues to non-admin users. It is set server-side (`httpOnly`, `secure`, `SameSite=lax`) after a verified magic-link flow and cannot be forged by clients. API routes use it for booking ownership checks — a booker can edit or cancel their own bookings without being an admin. The ownership check always fetches the booking from Supabase first (workspace-scoped), then compares `booking.booker_email` against the cookie value.

### Admin guard placement in API routes

> See [ADR-009](decisions/009-mock-mode-admin-guard-placement.md) — the MOCK_MODE footgun and the rule for placing admin guards.

API routes that gate on admin access **must** place the admin cookie check **after** any `MOCK_MODE` early return:

```ts
// ✅ CORRECT
export async function GET(req, { params }) {
  if (process.env.MOCK_MODE === 'true') {
    return Response.json(getMockData())   // demo path — no admin cookie exists
  }
  const adminRole = req.cookies.get(`admin_${params.workspace}`)?.value
  if (!adminRole) return Response.json({ error: 'Admin required.' }, { status: 403 })
  // ... production path
}

// ❌ WRONG — breaks the demo admin panel
export async function GET(req, { params }) {
  const adminRole = req.cookies.get(`admin_${params.workspace}`)?.value
  if (!adminRole) return Response.json({ error: 'Admin required.' }, { status: 403 })
  if (process.env.MOCK_MODE === 'true') { ... }
}
```

The demo admin panel (reachable via `/demo-admin`) sets a session cookie but never sets an `admin_{slug}` cookie — it bypasses the normal admin password flow. Placing the guard first silently breaks the demo.

This rule applies to **READ routes only** (GET). Write routes that already had admin guards before MOCK_MODE branches pre-date this pattern; don't move those without testing the demo write flows.

### Legacy flat routes (pre-multi-tenancy)

`/api/rooms` and `/api/bookings` are flat routes from before workspace scoping was introduced. They are now **mock-only**: in non-MOCK_MODE they return `410 Gone` with `{"error":"Use workspace-scoped endpoint"}`. Do not add production logic to these routes — use `/api/[workspace]/rooms` and `/api/[workspace]/bookings` instead.

### Known gaps

**Fixed 2026-09-17:**
- `GET /api/[workspace]/gcal/calendars` — no admin guard ([#129](https://github.com/brittanyrferrero/spacebook/issues/129)) — now checks `admin_{workspace}`.
- `POST /api/[workspace]/gcal/watch` — no admin guard ([#129](https://github.com/brittanyrferrero/spacebook/issues/129)) — now checks `admin_{workspace}`.
- `DELETE /api/gcal/disconnect/[roomId]` (the global, Palantir-only variant — not the workspace-scoped one, which already had a guard) — no auth check at all, found during the #129 fix, was never filed separately. Now checks `palantir_session`.

**Not yet fixed:** the `admin_{workspace}` / `palantir_session` cookies these guards check are plain, predictable role strings (`'admin'`, `'super_admin'`), not signed or random tokens — see [ADR-001](decisions/001-slug-as-secret-auth.md#notes), tracked as [#163](https://github.com/brittanyrferrero/spacebook/issues/163). httpOnly + SameSite stop browser-based forgery, but a raw HTTP client presenting the right header isn't stopped by presence-checking alone. This is systemic (every admin-gated route in the app uses this same pattern) rather than specific to GCal, so fixing #129-style gaps by adding this check is still strictly better than not checking at all — but don't mistake "has an admin cookie check" for "is fully hardened" when reviewing new routes.

## Data model

```
workspaces
  └── rooms            (workspace_id FK)
  └── bookings         (workspace_id + room_id FK)
  └── recurring_series (room_id FK)
  └── members          (workspace_id FK, unique on email+workspace)
```

Key constraints:
- Bookings have an exclusion constraint preventing double-booking on the same room + time range (cancelled bookings are excluded)
- Members use upsert — the same email can exist in multiple workspaces independently

Config that doesn't need relational queries lives in Redis: display hours, booking visibility settings, room types, amenity options, admin roles, and trial limits.

## Trial limits

New workspaces created via `/generate` start on a trial tier with resource caps:

| Resource | Trial limit |
|---|---|
| Rooms | 10 |
| Members | 3 |
| Bookings | 5 |

Limits are stored in Redis (`ws:{workspaceId}:limits`) and enforced at each creation endpoint. A `null` value for any limit means unlimited. Limits are managed manually via the Palantir super-admin panel.

The `WorkspaceLimits` interface and `TRIAL_LIMITS` constant live in `lib/prod-config.ts`.

## Analytics

> See [ADR-003](decisions/003-in-memory-stats.md) — why utilisation stats are computed in JavaScript rather than in SQL.

The admin dashboard computes booking stats (total hours, utilisation %, concurrent occupancy, day-of-week heatmap) by fetching raw bookings for a date range and aggregating them in-memory in the API route (`app/api/[workspace]/admin/stats/route.ts`). There is no materialised view or stored aggregation.

## Google Calendar sync

> See [ADR-004](decisions/004-gcal-oauth-callback-global.md) — why the GCal OAuth callback is a global route rather than workspace-scoped.
> See [ADR-015](decisions/015-disable-room-leaves-gcal-connected.md) — why disabling a room doesn't touch its GCal connection.
> See [ADR-016](decisions/016-gcal-guest-invite-booking.md) — booking via guest-invite from a personal calendar, and why that (not Location-field text) is the mechanism. See [gcal-guest-invite-setup.md](runbooks/gcal-guest-invite-setup.md) for the manual per-room sharing step this depends on.

Each room can be linked to a Google Calendar ID. Sync is **per-room OAuth**, not a service account: an admin connects a room by going through Google's consent flow (`/api/[workspace]/gcal/auth`), and the resulting refresh token is stored per room in Redis (`gcal:tokens:{roomId}`, see [ADR-005](decisions/005-kv-vs-supabase.md)).

- Spacebook registers a **push notification webhook** with Google for each linked room's calendar
- When Google notifies Spacebook of a change, the webhook at `/api/[workspace]/gcal/webhook` checks for conflicts
- If an external event conflicts with an existing Spacebook booking, the event organiser is emailed and the conflict is rejected
- **Spacebook is always the source of truth** — external events that conflict are not accepted
- If the room is disabled (`is_active: false`), new external events are silently not mirrored into Spacebook at all — no conflict check, no email, and the calendar event itself is left untouched (ADR-015)
- If a room's `gcal_resource_email` (conference cart) is set, it's auto-attached as a resource attendee to any inbound external event that doesn't already have it — this already covers bookings made via guest-invite (ADR-016) with no extra code needed

## Tablet display lifecycle

The room display page (`/[workspace]/room/[roomId]`) is designed to run as a permanently-open browser session on a wall-mounted tablet. Several behaviours exist specifically for this use case:

**Session persistence** — tablets authenticate once via a tablet token (`/api/[workspace]/tablet-enter?room=...&t=...`), which sets a long-lived `ws_{slug}` cookie (10-year expiry). The token is stored on the room record in Supabase. Tablets do not need to re-authenticate unless the room's tablet token is regenerated.

**Data refresh** — bookings are re-fetched from the API every 60 seconds so the calendar stays current without a page reload.

**Inactivity reset** — after 2 minutes of no interaction, the view resets to today's day view and closes any open modals. This keeps the display tidy between uses.

**Walk-in bookings** — the "BOOK NOW" path (duration buttons) creates a booking under the name `Walk-in` with a placeholder email (`walkin@tablet.spacebook.app`). No name or email is required from the user. The confirmation screen auto-dismisses after 2.8 seconds. This path calls `handleWalkIn`, which sends `new Date()` directly — no 15-minute snapping, no past-time guard. See below for how the desktop "Book Now" differs.

**Deployment auto-reload** — the page polls `/api/version` every 2 minutes. On mount it captures the current `VERCEL_GIT_COMMIT_SHA`; if a subsequent poll returns a different value, it calls `window.location.reload()`. This means tablets pick up new deployments within 2 minutes automatically. See [ADR-006](decisions/006-tablet-auto-reload.md) for the decision rationale.

**Screenshot upload** — 5 seconds after mount, and every 5 minutes thereafter, the page dynamically imports `html2canvas`, renders its own DOM to a canvas, and POSTs a JPEG to `/api/[workspace]/tablet-snapshot`. These screenshots are stored in Redis and surfaced in the palantir overlord view so super-admins can see what each tablet's browser is actually rendering. The upload is fire-and-forget — a failure is silently swallowed and never crashes the tablet page. See [ADR-011](decisions/011-tablet-screenshot-approach.md) for why html2canvas was chosen over iframes, puppeteer, and ADB.

## Desktop "Book Now" and "Schedule for later"

> See [ADR-008](decisions/008-book-now-time-semantics.md) — why "Book Now" uses retroactive slot timing and why past-time validation must not apply to it.
>
> See [ADR-013](decisions/013-modal-overflow-scroll.md) — the room dropdown's scroll-clipping bug needed three fixes: `maxHeight`/`overflowY` on the modal card, replacing the dropdown's fixed-position click-catcher (which silently blocked scroll-chaining) with a document-level click-outside listener, and finally collision-aware popover positioning so the dropdown scrolls itself in place instead of requiring the whole modal to scroll.

The main booking page (`app/[workspace]/(booking)/page.tsx`) has two booking paths that share a single submit function, `handleQuickBook`:

- **"Book Now"** (`showModal === 'now'`): the user is already in the room. Start time is floored to the most recent 15-minute slot (e.g. at 5:13 → "05:00"); end time defaults to nearest 15-minute increment to now + 60 min (e.g. "06:15"). The booking retroactively claims the slot from its start.
- **"Schedule for later"** (`showModal === 'later'`): the user picks a future date and time. A past-time guard rejects start times earlier than the current moment.

**Critical invariant:** any validation in `handleQuickBook` that checks whether a time is in the past must be guarded by `showModal === 'later'`. "Book Now" start times are intentionally in the recent past.

This is different from the tablet walk-in path, which uses `handleWalkIn` and sends `new Date()` directly.

## Design token system

> See [ADR-010](decisions/010-design-token-system.md) — why tokens are a typed JS object instead of CSS variables or Tailwind, and how the preset system sets up future workspace colour customisation.

The booking page uses **inline styles exclusively**. Visual constants (event colour, accent, now-line, past-time treatment) live in a `workspaceTheme` object at the top of `app/[workspace]/(booking)/page.tsx`, initialised from a `PALETTE_PRESETS` array.

The existing `ROSE` and `NAVY` constants reference `workspaceTheme` — downstream code is unchanged. Dark mode colours live separately in `mkT(dark)` and are not affected by `workspaceTheme`.

**Adding a new theme token:** add the key to `workspaceTheme`, consume it in the relevant inline style. Don't add new hardcoded colour hex values to the render tree — put them in a preset or in `workspaceTheme` directly.

**Accent colour picker:** workspace admins can set a custom accent (rose/highlight) colour from the admin panel. The value is stored in Redis at `ws:{workspaceId}:cfg:accentColor` and returned via `/api/[workspace]/settings`. Both the desktop booking page and the tablet display page read it on mount and pass it down as a `rose` prop to sub-components. Text on accent-coloured elements uses a WCAG relative-luminance check (`contrastColor()`) to automatically switch between `#111111` and `#ffffff` for readability.

## Routing and middleware

The Next.js middleware (`middleware.ts`) runs on every request to `/{workspace}/...`:
1. Validates the workspace slug exists
2. Checks for a valid session cookie (`ws_{slug}`)
3. Redirects to the workspace entry page if no valid session

Admin routes additionally check for the `admin_{slug}` cookie.

**Palantir bypass** — the middleware also accepts a `palantir_session` cookie as a pass-through for any workspace route. This gives the palantir super-admin access to all workspace pages and APIs without needing workspace-specific session cookies. The cookie is httpOnly and Secure; it cannot be set from client-side JavaScript. See [ADR-012](decisions/012-palantir-middleware-bypass.md) for the full reasoning and the important caveat about blast radius.

**Reserved slugs** — workspace slugs cannot match any segment in `PUBLIC_API_SEGMENTS` or `PUBLIC_SEGMENTS` (the middleware's public bypass lists). If they did, the middleware would skip auth for all that workspace's API routes. The full blocklist lives in `RESERVED_SLUGS` in `lib/workspace.ts` and is enforced at rename time. The slug generator produces three-word slugs (e.g. `amber-oak-vale`) that never collide with reserved names.
