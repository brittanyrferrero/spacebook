# ADR-005: Redis/KV for workspace config vs Supabase
Date: 2026-06-05
Status: Accepted

## Context

Spacebook stores two categories of data:

1. **Relational data** — rooms, bookings, recurring series, members, workspaces. These have foreign key relationships, need to be queried by date range or room ID, and benefit from the exclusion constraint that prevents double-booking.

2. **Config and ephemeral data** — display hours, booking hours, room types, amenity options, booking visibility settings, admin role assignments, trial/resource limits, GCal OAuth nonces, admin recovery nonces, session tokens, GCal tokens, and GCal webhook state.

The question was: should config/ephemeral data live in Supabase alongside relational data, or in a separate store?

## Decision

Everything in category 2 lives in Upstash Redis (accessed via `KV_REST_API_URL` / `KV_REST_API_TOKEN`). Supabase stores only category 1.

All Redis keys are namespaced by workspace ID using the pattern `ws:{workspaceId}:{key}`. Non-workspace keys (GCal OAuth nonces, recovery nonces) use their own prefixes (`gcal:nonce:`, `recovery:nonce:`, etc.).

The main data access layer is `lib/prod-config.ts`. Watch state and token state for GCal live in `lib/google-calendar/watchStore.ts` and `lib/google-calendar/tokenStore.ts`.

## Consequences

### Why Redis for config

**No schema migrations for new config options.** Adding a new workspace setting (e.g. a new boolean toggle in the Settings tab) requires no database migration. The new key either exists in Redis or returns a code-defined default. Supabase would require an `ALTER TABLE` migration, a new column in the type definitions, and a migration file in `supabase/migrations/`. For settings that are simple key-value pairs, that overhead is disproportionate.

**TTL is a first-class feature.** OAuth nonces and recovery nonces need to expire automatically. Redis `EX` lets you set a TTL in seconds at write time (`gcal:nonce:*` expires after 600s, `recovery:nonce:*` after 3600s). In Supabase this would require either a cron job to clean up expired rows, or a custom check in the read path that compares `created_at` to the current time. Redis handles it for free.

**Config is not relational.** Display hours, room types, booking visibility — none of these have foreign keys or need to be JOINed with other tables. Storing them in Redis as JSON values (the natural KV pattern) is simpler than normalising them into relational columns.

**Workspace isolation is easy to enforce.** Every Redis key is prefixed with `ws:{workspaceId}:`. This is an application-level convention (enforced by the `k()` helper in `lib/prod-config.ts`), but it's straightforward and reviewable. There's no RLS complexity.

### Why not Redis for relational data

Bookings need an exclusion constraint (Postgres `EXCLUDE USING gist`) that prevents two bookings on the same room from overlapping in time. This is a database primitive. Redis has no equivalent — you'd need to implement optimistic locking in application code and accept race conditions under concurrent load.

Booking queries need filtering by date range, room ID, workspace, and cancellation status simultaneously. Redis has no query language. You'd need to load all bookings and filter in JS — which is the approach for stats (see ADR-003), but that's acceptable for read-only aggregations, not for the operational booking path.

### Redis key taxonomy

| Prefix | What it stores | TTL |
|---|---|---|
| `ws:{id}:cfg:roomTypes` | Workspace room type list | None |
| `ws:{id}:cfg:amenityOptions` | Workspace amenity list | None |
| `ws:{id}:cfg:displayHours` | Display hours `{start, end}` | None |
| `ws:{id}:cfg:bookingHours` | Booking hours `{start, end}` | None |
| `ws:{id}:cfg:bookingVisibility` | Visibility flags | None |
| `ws:{id}:cfg:countWeekends` | Boolean | None |
| `ws:{id}:cfg:admins` | `[{email, role}]` array | None |
| `ws:{id}:limits` | `WorkspaceLimits` object | None |
| `ws:{id}:entry_token` | Workspace session token | None |
| `gcal:tokens:{roomId}` | OAuth refresh/access token | None |
| `gcal:watch:{roomId}` | `WatchState` object | None |
| `gcal:channel:{channelId}` | roomId reverse-lookup | None |
| `gcal:watched_rooms` | Set of room IDs with active watches | None |
| `gcal:nonce:{uuid}` | `{workspace, roomId}` for OAuth CSRF | 600s |
| `recovery:nonce:{uuid}` | workspaceId for admin recovery | 3600s |

### When to revisit

If Spacebook adds workspace-level analytics retention (e.g. storing historical stats snapshots), or if any config option needs to be queried across workspaces (e.g. "find all workspaces on trial"), Redis becomes the wrong choice for that data. At that point, a Supabase table with proper indexing is better.

The current Redis schema also has no formal versioning — if a config shape changes (e.g. `bookingVisibility` gains a new field), the read path handles it with spread defaults. That works fine for additive changes but is worth monitoring as the config schema grows.
