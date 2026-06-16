# ADR-008: Book Now time semantics — retroactive slot claim vs. future guard
Date: 2026-06-16
Status: Accepted

## Context

The desktop booking page (`app/[workspace]/(booking)/page.tsx`) has two booking paths that both call `handleQuickBook`:

- **"Book Now"** (`showModal === 'now'`): the user is in the room right now and wants to claim it immediately.
- **"Schedule for later"** (`showModal === 'later'`): the user is picking a future (or same-day) slot using the time pickers.

In June 2026 a fix was added to block past bookings in the "Schedule for later" modal. The check was placed in `handleQuickBook`, which is shared:

```js
if (new Date(startTime) < now) {
  setMError('Start time is in the past.'); return
}
```

This silently broke "Book Now". Here's why.

"Book Now" snaps the start time to the **floor** of the current 15-minute slot — e.g. at 5:13 the start is set to "05:00". That's intentional: the calendar block should show the room as occupied from the beginning of the current slot. But "05:00" is 13 minutes in the past, so `new Date(startTime) < now` fires and the booking is rejected.

The regression was subtle because it only triggered at non-zero seconds within a minute. The symptom was "Start time is in the past" on an apparently valid booking.

## Decision

**"Book Now" is retroactive by design. It must never be subject to the past-time guard.**

The guard is conditioned on `showModal === 'later'`:

```js
if (showModal === 'later' && new Date(startTime) < now) {
  setMError('Start time is in the past.'); return
}
```

**Time calculation for "Book Now"** uses two separate anchors:

```js
const totalMins   = nowD.getHours() * 60 + nowD.getMinutes()
const startMins   = Math.floor(totalMins / 15) * 15   // floor → retroactive slot start
const nearestMins = Math.round(totalMins / 15) * 15   // round → anchor for end time
const t  = fromMins(Math.min(startMins, 23 * 60))
const et = Math.min(nearestMins + 60, 23 * 60)
```

| Click time | Start | End (default 60 min) |
|---|---|---|
| 5:00 | 05:00 | 06:00 |
| 5:07 | 05:00 | 06:00 (nearest = 5:00) |
| 5:08 | 05:00 | 06:15 (nearest = 5:15) |
| 5:13 | 05:00 | 06:15 (nearest = 5:15) |
| 5:15 | 05:15 | 06:15 |

End time uses `Math.round` so it is anchored to the nearest slot to the actual current time — not to the floored start. This ensures the default duration is at least 60 minutes from when the user actually clicked.

Both times are always multiples of 15, so `TimePicker` (which only offers 0/15/30/45 minutes) displays them correctly.

## Consequences

**Better:** "Book Now" works at any second within a 15-minute window, including exactly on the boundary.

**Better:** The end-time default is meaningful — it's 60 minutes from approximately now, not 60 minutes from the start of the slot (which could be up to 14 minutes ago).

**Invariant for future maintainers:** Any validation added to `handleQuickBook` that references `now` or checks whether a time is in the past **must** be guarded with `showModal === 'later'`. "Book Now" start times are always in the recent past by design.

**Note on the tablet path:** The tablet's "BOOK NOW" (duration buttons in `app/[workspace]/room/[roomId]/page.tsx`) goes through `handleWalkIn`, not `handleQuickBook`. It uses `new Date()` directly and sends the exact current timestamp — no 15-minute snapping, no past-time guard. The two "Book Now" surfaces have different mechanics; see architecture.md for the full picture.
