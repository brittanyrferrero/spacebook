# ADR-020: "Finish early" on the tablet room display

Date: 2026-09-28
Status: Proposed — idea saved for later, not implemented

## Context

Meetings often wrap up before their booked end time. Right now the room stays
"In use" on the tablet until the booked end, even though it's empty, so people
walking past assume it's taken and go elsewhere.

Cancelling doesn't fit this case. A meeting that has already started happened —
cancelling it would wipe it from the record (and from Google Calendar), which
is wrong. What we actually want is to say "this ended now" and hand the room
back.

The idea came out of the Linen tablet redesign mockups (Design canvas
"Spacebook Tablet Redesigns", boards 03 / 03d), where it's prototyped.

## Proposal

**UI (tablet, `app/[workspace]/room/[roomId]/page.tsx`)**

- While a booking is in progress, show a **Finish early** button on the bottom
  left of the display, on the same line as "Book for later". Hidden when the
  room is free.
- Confirm in a pop-up: "Finish this meeting now?" naming the meeting and its
  booked end, with **Keep meeting** / **Yes, finish now**. Tapping outside
  keeps the meeting. A shared hallway tablet gets stray taps, so one tap must
  never end a meeting.
  - An earlier version used a two-tap button ("Tap to confirm" in place, reverting
    after 4s). In testing on the tablet the second step was easy to miss, so
    it became a pop-up (2026-09-29).
- On confirm the room flips straight back to Available, with a short
  "Freed early · thank you" note under the status.

**Data**

- Finishing early **trims** the booking rather than cancelling it: set
  `end_time = now` (rounded down to the minute). The booking stays on the
  calendar as a past block ending at the real time — an honest record, and
  stats keep counting it.
- Store that it was finished early (e.g. a nullable `ended_early_at`
  column) so we can tell a trimmed booking from one that was originally
  booked short. Useful for stats later ("how often do rooms free up early?").
- Recurring series: only the current occurrence is trimmed, never the series.

**Google Calendar**

- If the booking has a `google_event_id`, update the event's end time with the
  existing `updateCalendarEvent` (same path as `PATCH /bookings/[id]`), not
  `deleteCalendarEvent`. The GCal event should shrink, not disappear.
- The inbound webhook sync must accept the shortened event without treating it
  as a conflict or a new edit that bounces back.

## Open questions

1. **Who is allowed to finish early?** Today `DELETE /bookings/[id]` requires
   an admin cookie or the booking owner's `mb_` cookie. The tablet is used by
   whoever is standing at it, and only holds the workspace cookie. Options:
   - Allow anyone at a tablet (workspace cookie) to finish early, but only for
     the booking currently in progress *in that room*, and only to end it
     *now* — no arbitrary end times. Lowest friction; the risk is someone
     ending a meeting that's still going. Mitigated by the confirm step and by
     notifying the booker.
   - Require the booker's email / PIN at the tablet. Safer, more friction.
   Leaning towards the first, plus an email to the booker ("Your booking in
   Board Room was finished early at 10:42 from the room tablet").
2. **New endpoint or PATCH?** A dedicated `POST /api/[workspace]/bookings/[id]/finish`
   keeps the tablet-scoped rules (in progress, this room, end = now) server-side
   and away from the general edit path. Preferred over reusing PATCH.
3. **Walk-in bookings made at the tablet** — same action, same rules; no special case.
4. Rate-limit the endpoint like the other tablet actions.

## Before implementing

- Run `/scale-check` (workspace scoping on the new endpoint) and a
  `/paranoid-security` pass on the auth decision above.
- Add a regression test: finishing early trims `end_time`, leaves
  `cancelled_at` null, and updates (not deletes) the GCal event.
