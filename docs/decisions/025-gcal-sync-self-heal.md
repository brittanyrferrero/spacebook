# ADR-025: The daily GCal cron re-registers lost watch channels itself
Date: 2026-10-22
Status: Accepted

## Context

The daily sync-health check in `GET /api/gcal-renew` (added 2026-09-16, see
`docs/runbooks/gcal-not-syncing.md`) flags rooms that have valid OAuth tokens but no
usable watch channel, and emails every address in `PALANTIR_ADMINS`. It alerts, but
it doesn't fix anything. If nobody acts, the same email arrives every morning, and the
room is deaf to external calendar changes the whole time.

By 2026-10-22 the email had become a regular part of the inbox: the same 5 rooms in the
MAP workspace (NW, SW, Recording Studio, E1, South Conference Room), all with "no watch
channel registered", the same set as the 2026-09-17 incident. The fix every time is the
runbook's fast path: `POST /api/{workspace}/gcal/watch` per room with the existing
tokens. That needs no judgement, no Google re-consent, and no human input beyond clicking.

The destructive half of the root cause is known: the renewal loop deleted watch state
whenever a token read came back empty, and rooms fixed together expire together, so one
bad read wiped the whole workspace. [ADR-019](019-gcal-watch-state-not-deleted-on-token-miss.md)
removes that delete. It was written on 2026-09-23 but sat unmerged as PR #166, which is
why the emails kept coming. This change ships stacked on it.

The *trigger* (why `getTokens()` returns null for keys that exist) is still unknown.
ADR-019 named Upstash eviction as the lead, but that doesn't fit: tokens were present
again on later runs, and nothing recreates tokens except a full OAuth consent that nobody
did. See the "Third recurrence" note in the runbook. With ADR-019, a bad read no longer
deletes anything, but it still skips that day's renewal. If it repeats on consecutive
days, a watch can still expire. Self-heal covers that case too.

## Decision

When the health check finds an active room with tokens whose watch is **missing or
expired**, it calls `registerWatch()` itself, the same code the admin "pick calendar"
flow uses. If that works, the room is listed in a secondary "Fixed automatically"
section of the email. If it fails, the room goes in the main alert section, and the
reason includes Google's error. When every problem was fixed, the subject line says
"sync restored", not "not syncing". Days with nothing to report still send no email.

- Watch registration was pulled out of the `POST /gcal/watch` route into
  `lib/google-calendar/registerWatch.ts`, so the route and the cron share one
  implementation. It uses `getAuthClient()` from `lib/google-calendar/client.ts`
  (now exported) instead of a third copy of the OAuth-client setup.
- Rooms whose renewal failed *in this run* are not retried. They were just tried, and
  the failure is already logged under `[gcal renew]`.
- Each heal logs `[gcal renew] self-healed watch channel` with room, workspace, and
  `missing`/`expired`, and the cron's JSON response gains a `healedRooms` count.

### Alongside it: the webhook no longer writes back a stale snapshot

While reviewing this path we found that `processWebhook()` read the watch state at the
start, paged through calendar changes, then saved `{ ...watchState, syncToken }` at
the end. If the renewal cron swapped in a new channel during that window, the webhook
overwrote it with the old channel ID, resource ID, expiry and `webhookToken`. Google's
notifications on the new channel would then be rejected as unverified until the next
renewal. And if the room was disconnected during that window, the write resurrected its
watch state.

The webhook now calls `saveSyncToken(roomId, token)` in `watchStore.ts`. It re-reads the
current state, merges in only `syncToken`, and does nothing if the state is gone. That is
still read-then-write, but the window shrinks from "the whole sync" to two Redis
round-trips, and it can no longer bring deleted state back. Sync tokens belong to the
calendar, not the channel, so keeping the token across a channel swap is correct.

## Consequences

**Better:** A lost watch now costs at most one day of missed external changes instead of
"until someone reads the email and clicks". The alert section goes back to meaning "a
human needs to look": revoked access, a deleted calendar, a broken app URL.

**Worse:** This can still hide a recurring problem. If something keeps deleting watch
state, the cron repairs it every night, and sync is still dead for up to 24 hours at a
time. The first version of this change sent no email for a successful repair, and only
logged `self-healed watch channel`. That was reversed before shipping. A problem you only
see by searching the logs isn't really visible, so repaired rooms are reported in the
email too, just without the alarm. **If the same rooms keep appearing under "Fixed
automatically", the root cause is still active.** Look at the Redis side: whether the Upstash database has read
replicas, and whether every environment that runs the cron points at the same
`KV_REST_API_URL` as the app. Also look at the `[gcal renew] no tokens found` lines
from ADR-019 on the same day.

**For future maintainers:**
- Self-heal only applies to rooms the app itself considers connected (`hasTokens`),
  active (`is_active`), and with a `google_calendar_id`. Disconnected and disabled rooms
  are left alone, exactly as before (see ADR-015).
- `registerWatch()` stops and removes any existing watch before registering a new one.
  It's safe to call on a room that already has a watch, but it does one full
  `events.list` page-through per call to get a sync token, so don't call it in a hot path.
- Tests: `__tests__/gcal-renew-route.test.ts`.
