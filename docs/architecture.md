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

Session cookies are validated against tokens stored in Redis — a slug rename immediately invalidates all existing sessions because the token changes.

Admin roles (`admin`, `super_admin`) are stored per-workspace in Redis under `ws:{workspaceId}:cfg:admins`.

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

Each room can be linked to a Google Calendar ID. Sync uses a Google service account — no OAuth per user.

- Spacebook registers a **push notification webhook** with Google for each linked room's calendar
- When Google notifies Spacebook of a change, the webhook at `/api/[workspace]/gcal/webhook` checks for conflicts
- If an external event conflicts with an existing Spacebook booking, the event organiser is emailed and the conflict is rejected
- **Spacebook is always the source of truth** — external events that conflict are not accepted

## Tablet display lifecycle

The room display page (`/[workspace]/room/[roomId]`) is designed to run as a permanently-open browser session on a wall-mounted tablet. Several behaviours exist specifically for this use case:

**Session persistence** — tablets authenticate once via a tablet token (`/api/[workspace]/tablet-enter?room=...&t=...`), which sets a long-lived `ws_{slug}` cookie (10-year expiry). The token is stored on the room record in Supabase. Tablets do not need to re-authenticate unless the room's tablet token is regenerated.

**Data refresh** — bookings are re-fetched from the API every 60 seconds so the calendar stays current without a page reload.

**Inactivity reset** — after 2 minutes of no interaction, the view resets to today's day view and closes any open modals. This keeps the display tidy between uses.

**Walk-in bookings** — the "BOOK NOW" path (duration buttons) creates a booking under the name `Walk-in` with a placeholder email (`walkin@tablet.spacebook.app`). No name or email is required from the user. The confirmation screen auto-dismisses after 2.8 seconds.

**Deployment auto-reload** — the page polls `/api/version` every 2 minutes. On mount it captures the current `VERCEL_GIT_COMMIT_SHA`; if a subsequent poll returns a different value, it calls `window.location.reload()`. This means tablets pick up new deployments within 2 minutes automatically. See [ADR-006](decisions/006-tablet-auto-reload.md) for the decision rationale.

## Routing and middleware

The Next.js middleware (`middleware.ts`) runs on every request to `/{workspace}/...`:
1. Validates the workspace slug exists
2. Checks for a valid session cookie (`ws_{slug}`)
3. Redirects to the workspace entry page if no valid session

Admin routes additionally check for the `admin_{slug}` cookie.

**Reserved slugs** — workspace slugs cannot match any segment in `PUBLIC_API_SEGMENTS` or `PUBLIC_SEGMENTS` (the middleware's public bypass lists). If they did, the middleware would skip auth for all that workspace's API routes. The full blocklist lives in `RESERVED_SLUGS` in `lib/workspace.ts` and is enforced at rename time. The slug generator produces three-word slugs (e.g. `amber-oak-vale`) that never collide with reserved names.
