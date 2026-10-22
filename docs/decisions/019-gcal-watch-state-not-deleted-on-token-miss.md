# ADR-019: Don't delete GCal watch state on a transient token-fetch miss

Date: 2026-09-23
Status: Accepted

## Context

The daily renewal cron (`app/api/gcal-renew/route.ts`) walks every room with a
watch channel due to expire within 2 days and re-registers it with Google.
Since the initial commit (May 2026), the very first thing it did for each room
was fetch that room's stored OAuth tokens — and if `getTokens(roomId)` came
back falsy, it immediately called `removeWatchState()` and moved on to the
next room. The reasoning at the time was presumably "no tokens means this room
isn't really connected, so there's nothing to renew."

That reasoning conflates two very different situations: *tokens were
genuinely revoked* (the user disconnected, or Google invalidated the grant)
versus *the token read just failed* (a transient KV/network blip, or any
other reason `getTokens` returns null without the tokens actually being
gone). The code had no way to tell these apart, and treated both identically:
delete the watch state, right now, no retry, no second opinion.

This turned out to matter because of how watch state gets created. Rooms
usually get their watch registered in a burst — either together during
initial GCal setup, or, more visibly, whenever the fast-path fix in
[gcal-not-syncing.md](../runbooks/gcal-not-syncing.md) is used to re-register
several rooms in a workspace at once (its own curl example is a plain loop
over room IDs, seconds apart). Google watch channels run ~7 days, so a batch
registered together also expires together, which means the whole batch lands
in the cron's "due for renewal" branch on the *same day*. If whatever causes
a bad `getTokens` read happens during that one cron run, it doesn't cost one
room — it wipes every room in the workspace at once, and does so *silently*
(no error surfaced anywhere until the next day's sync-health check notices).

This is very likely what caused the `plonk-mango-wizard` workspace (shown to
users as "MAP") to lose watch state for all 5 of its rooms twice — once
found 2026-09-17, and again 2026-09-23/24, almost exactly 7 days after the
first incident was fixed via the fast path. Both times, OAuth tokens were
confirmed still valid when investigated, which is inconsistent with a real
revoke and consistent with a transient read failure at cron time.

**Confirmed via `vercel logs` (2026-09-24):** the daily cron ran on schedule
and returned 200 for 2026-09-22, -23, and -24 (ruling out a scheduling or
`CRON_SECRET` failure). No deployment landed within hours of any of those
2am UTC runs (ruling out an env/deploy-timing coincidence). No request to
either disconnect route (`app/api/[workspace]/gcal/disconnect/[roomId]` or
the global `app/api/gcal/disconnect/[roomId]`) occurred in the 24h before
the 2026-09-23 02:00 UTC run (ruling out a stray/accidental real disconnect).
And critically: that run produced **zero log output** for
`/api/gcal-renew` — no thrown exception was ever logged (the outer
`catch` block's `console.error('[gcal renew] failed to renew watch
channel', ...)` already existed pre-fix and would have fired and been
captured if `getTokens()` had thrown; a separate, unrelated
`[gcal write]` error from the same deployment *was* captured with a full
stack trace in the same log window, proving the logging pipeline does
capture and expose this kind of detail when something actually throws).
So `getTokens(roomId)` returned `null` **cleanly**, for all 5 rooms, in the
same run — the stored token keys were genuinely absent from Redis at that
exact read, not merely slow or erroring to fetch. That points more
specifically at the keys themselves disappearing at the infra layer (Upstash
key eviction under memory pressure being the leading remaining candidate)
rather than a generic network blip. Confirming that specific mechanism
still needs the Upstash dashboard (DB size, eviction policy) — not
available from this session — but the "transient blip" framing above should
be read as "transient key loss," not "slow read."

## Decision

The renewal cron no longer calls `removeWatchState()` when a token fetch
comes back empty. Instead it logs the room ID, counts it as a renewal error,
and adds it to `failedRoomIds` — the same bucket every *other* renewal
failure in that function already falls into (a thrown error from the Google
API, for instance, was never treated as grounds for deletion; only this one
branch was). The sync-health check downstream already only flags a room as
unhealthy if `hasTokens()` is true for it, so a room that's genuinely
disconnected is correctly excluded from alerts with no change needed there.

Actual watch-state cleanup for a real disconnect already happens explicitly
in `app/api/[workspace]/gcal/disconnect/[roomId]/route.ts`, which calls
`removeWatchState()` itself at the moment of disconnect. The cron doesn't
need to duplicate that — it was never the right place to infer a disconnect
from an ambiguous signal.

That was only true of the workspace route at first. The global Palantir
disconnect (`app/api/gcal/disconnect/[roomId]/route.ts`) removed tokens and
nothing else, so the cron's eager delete had quietly been cleaning up after
it. Found during review before shipping this fix (2026-09-28). That route now
stops the channel and removes watch state the same way the workspace route
does, so every disconnect path cleans up after itself.

## Consequences

**What got better:**
- A transient token-read failure during the renewal cron can no longer wipe
  out watch state for an entire workspace's worth of rooms in one run.
- Failure is now visible: it shows up in the `errors` count and (via
  `failedRoomIds`) in the sync-health email, instead of being silently
  converted into "no watch channel registered" the next time anyone looks.

**What got worse / constraints to know:**
- A room whose tokens really *are* gone (revoked, never connected) but that
  somehow still has a `gcal:watch:*` entry (shouldn't normally happen, since
  disconnect cleans up after itself, but could arise from a bug elsewhere)
  will now keep showing up in the cron's candidate list and keep failing
  quietly (as an error count, not a deletion) rather than being swept up
  automatically. This is an acceptable tradeoff — a stale record retried
  forever is much cheaper than deleting good state on a false signal — but
  if stale failed rooms start accumulating, that's worth investigating on
  its own rather than reintroducing eager deletion.
- The underlying cause of the falsy `getTokens()` read is still not
  confirmed. This fix stops it from being destructive; it does not explain
  or prevent the read failure itself. If it recurs, the next occurrence
  should be treated as a chance to actually check Vercel logs and the
  Upstash dashboard during the failure window, not just re-run the fast path
  again.
- Because all 5 `plonk-mango-wizard` rooms were just re-registered together
  again (2026-09-23) to fix this recurrence, they'll cluster for renewal
  again around **2026-09-30**. If the underlying trigger is still live,
  that's the next date it could resurface — now without destroying watch
  state, but still worth watching for in the sync-health email.

## Notes

**2026-09-23:** Fixed alongside the second `plonk-mango-wizard` incident. See
the "Recurring incident" note in
[docs/runbooks/gcal-not-syncing.md](../runbooks/gcal-not-syncing.md) for the
operational side of that day.

**2026-10-22:** This ADR sat unmerged (PR #166) for about 4 weeks, and the incident kept
recurring in the meantime. It shipped together with
[ADR-025](025-gcal-sync-self-heal.md), which adds a daily self-heal. One correction to
the Context section: eviction doesn't fit the evidence. Tokens were present for all
5 rooms on later runs, and the only code path that creates tokens from nothing is the
OAuth callback, which nobody went through. Every other `saveTokens` call is a refresh
that first requires an existing token. Evicted keys don't come back, so the keys
existed and the read missed them. Leading suspects are now a lagging Upstash read
replica, or the cron using a different `KV_REST_API_URL` than the app.
