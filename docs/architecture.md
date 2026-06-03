# Architecture

## Multi-tenancy

Spacebook uses **path-based multi-tenancy** — every workspace lives at `/[workspace]/`. The slug in the URL is the workspace identifier and doubles as the access credential (see [Auth model](#auth-model) below).

Workspace isolation is enforced at the application layer: every Supabase query filters by `workspace_id`, and every Redis key is namespaced as `ws:{workspaceId}:...`. There are no cross-workspace queries.

There are two deployed instances:
- **Demo** — runs in mock mode (in-memory data, no database)
- **Production** — real Supabase + Redis

## Auth model

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

## Google Calendar sync

Each room can be linked to a Google Calendar ID. Sync uses a Google service account — no OAuth per user.

- Spacebook registers a **push notification webhook** with Google for each linked room's calendar
- When Google notifies Spacebook of a change, the webhook at `/api/[workspace]/gcal/webhook` checks for conflicts
- If an external event conflicts with an existing Spacebook booking, the event organiser is emailed and the conflict is rejected
- **Spacebook is always the source of truth** — external events that conflict are not accepted

## Routing and middleware

The Next.js middleware (`middleware.ts`) runs on every request to `/{workspace}/...`:
1. Validates the workspace slug exists
2. Checks for a valid session cookie (`ws_{slug}`)
3. Redirects to the workspace entry page if no valid session

Admin routes additionally check for the `admin_{slug}` cookie.

Tablet kiosk routes (`/[workspace]/room/[roomId]`) use a separate tablet token stored in the room record, entered once during setup.
