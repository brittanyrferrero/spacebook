# ADR-015: Disabling a room leaves its Google Calendar connection untouched
Date: 2026-07-06
Status: Accepted

## Context

We needed a way to take a room out of rotation (e.g. it's under renovation, or being reconfigured) without losing its data — its history, its bookings, and its identity all need to survive so it can be turned back on later. Deleting a room isn't safe to reuse for this: `DELETE /api/[workspace]/rooms/[id]` performs a hard delete, and `bookings.room_id` / `recurring_series.room_id` are `ON DELETE CASCADE`, so deleting a room deletes its bookings with it (see the "Deleting a room" gap noted in [`docs/admin-guide.md`](../admin-guide.md), which currently promises soft-delete-like behavior the code doesn't provide).

The mechanism already existed: `Room.is_active` (added in the initial schema) was already filtered out of `getRooms()` — the query both the desktop calendar and the tablet kiosk use — and already had a working admin toggle. Turning that toggle off already achieved "disappears from the calendars, data untouched." The open question was what disabling should do to the room's Google Calendar connection.

Three options were on the table:

1. **Full disconnect** — revoke the stored OAuth refresh token, stop the Google push-notification channel (`calendar.channels.stop`), and clear `google_calendar_id`. This is the same teardown the existing manual "disconnect GCal" button performs (`app/api/[workspace]/gcal/disconnect/[roomId]/route.ts`).
2. **Pause** — stop the push channel only, keep the OAuth token and `google_calendar_id` stored, so re-enabling just re-registers the watch.
3. **Leave it alone entirely** — no change to the connection at all.

## Decision

We chose **option 3**, with one narrow exception described below. Disabling a room (`is_active: false`) never touches `google_calendar_id`, the stored OAuth tokens, or the push-notification watch state. Re-enabling a room is purely `is_active: true` — no reconnection step of any kind.

Full disconnect (option 1) was rejected for two reasons:

- **It doesn't accomplish what it looks like it accomplishes.** Spacebook disconnecting its own sync doesn't stop anyone from booking the *physical* room by inviting its Google Calendar directly — Spacebook has no control over that calendar's access. The calendar keeps behaving exactly as it did before; only Spacebook's awareness of it changes.
- **It creates real re-enable friction.** Because the OAuth token is deleted, turning the room back on means the office manager has to redo the full Google consent screen and re-pick the calendar from a list — for a calendar that never actually changed on Google's side.

Pause (option 2) was also considered — it would have avoided the OAuth-redo problem while still halting sync traffic — but was dropped in favor of the simpler "touch nothing" approach once it was clear that stopping the watch doesn't meaningfully improve on leaving it running (see below on why leaving it running is fine).

**The one exception:** the inbound webhook handler (`app/api/[workspace]/gcal/webhook/route.ts`, `processWebhook()`) now checks `room.is_active` before mirroring a *new* external Google Calendar event into a Spacebook booking. If the room is disabled, a new event on its linked calendar is simply not turned into a Spacebook booking — no booking row is created, no conflict check runs, no conflict-rejection email is sent, and critically, **the Google Calendar event itself is left completely alone**. This is Spacebook declining to record something, not Spacebook interfering with the calendar. Cancellations of *existing* Spacebook-linked bookings still sync through regardless of `is_active`, since that's reconciling data that already existed, not creating something new.

The public booking API (`app/api/[workspace]/bookings/route.ts` `POST`) got the same `is_active` guard, so a disabled room can't receive a new booking through Spacebook's own UI or a direct API call either. Between the two guards, a disabled room can't accumulate new Spacebook bookings from any origin — but its Google Calendar keeps operating exactly as it would if Spacebook didn't exist.

`getRoomById()` (`lib/data.ts`) was changed to resolve through `getAllRooms()` instead of the active-only `getRooms()`, so a disabled room's *existing* bookings — made before it was disabled — still resolve correctly (e.g. on the booking confirmation page).

## Consequences

- Re-enabling a room is instant and free — no OAuth, no re-picking a calendar, nothing to redistribute to anyone.
- A disabled room's Google Calendar can still be booked directly by anyone with access to it while the room is disabled. Spacebook will not reflect those bookings, and will not warn anyone about them. If a room truly needs to be inaccessible (not just hidden from Spacebook), that has to happen at the Google Calendar / facilities level — Spacebook cannot enforce it.
- If a future feature wants to *actually* prevent GCal-side booking during a disable window (not just suppress Spacebook's awareness of it), that requires either revoking Google-side access to the calendar (outside Spacebook's control) or reconsidering option 1/2 above with the re-enable friction it brings back. Don't reintroduce disconnect-on-disable without re-reading this ADR — it was tried in the plan for this feature and explicitly rejected.
