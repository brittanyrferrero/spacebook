# ADR-018: Room-availability checks must filter by calendar date, not just time-of-day
Date: 2026-09-16
Status: Accepted

## Context

A user reported that booking the South Conference Room for 9am–5pm on a Wednesday showed a "conflict," but she couldn't find any reservation on that room or day that would explain it — not in the app's calendar, not in the admin panel, not on Google Calendar. Exhaustive Supabase queries against `bookings` for that exact `room_id`, with no date restriction and `cancelled_at IS NULL`, confirmed there was genuinely nothing booked anywhere near that Wednesday.

The actual mechanism was in the booking modal's client-side availability check, `laterRoomAvailability` in `app/[workspace]/(booking)/page.tsx`:

```ts
taken: laterDayBkgs.filter(b => b.room_id === r.id && !b.cancelled_at).some(b => {
  const bs = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes()
  const be = new Date(b.end_time).getHours() * 60 + new Date(b.end_time).getMinutes()
  return bs < endMins && be > startMins
}),
```

`laterDayBkgs` comes from `GET /api/{workspace}/bookings?date={mDate}`, which — deliberately — fetches a **three-day-wide window** (`lib/data.ts`, `getBookingsForDate`: `gte(shiftDate(date, -1))` through `lte(shiftDate(date, +1))`, all in UTC). That padding exists so a booking whose UTC `start_time` lands on an adjacent calendar day near a timezone boundary still gets pulled in for a given local date. It's the right call for the fetch itself.

The bug is that the code consuming that response never re-narrowed it. It filtered by `room_id` and `cancelled_at`, then compared **only the hour and minute** of each booking against the requested time range — with no check that the booking's actual date matched the date being booked. So a real booking on a *completely different day* (in this incident, another person's booking the following Thursday, 10:30am–12:30pm local) that happened to share a clock-time with the Wednesday request being checked was treated as an active conflict for Wednesday.

`findNextAvailable` (same file, used for suggesting an alternative time after a real 409) already did this correctly — `bookings.filter(b => !b.cancelled_at && dateStr(new Date(b.start_time)) === date)` before ever touching hours/minutes. `laterRoomAvailability` and the post-409 `altRooms` computation just hadn't been written the same way.

## Decision

Every place that reduces a booking to "does it fall in this time window" must first confirm the booking is *on the day being checked* — using local calendar date (`dateStr(new Date(b.start_time)) === mDate`), not the raw fetch window's bounds. Time-of-day comparison (`getHours()*60+getMinutes()`) is only meaningful once you already know you're looking at the right day; used alone against an intentionally over-fetched window, it silently matches across days.

Fixed both remaining call sites in `app/[workspace]/(booking)/page.tsx` to filter by `dateStr(...) === mDate` before the minutes-overlap check, matching the pattern `findNextAvailable` already used.

## Consequences

**What gets better:**
- The "conflict" badge next to a room in the booking modal, and the alternate-room suggestions shown after a real 409, now only reflect bookings that actually exist on the requested day.

**What to watch for:**
- This is the same underlying failure mode as the day-bucketing issue elsewhere in these pages (a booking's calendar-day membership must be computed from its own timestamp, never inherited from whatever window a fetch happened to return) — if a new availability or calendar-grouping computation is added anywhere in `(booking)/page.tsx` or `room/[roomId]/page.tsx`, filter by `dateStr(...)` explicitly rather than assuming the array you're given is already scoped to one day. It usually isn't — several of the fetches in this codebase intentionally over-fetch for timezone safety.
- **The "conflict" badge shown while choosing a room in the "book later" modal was never actually wired into `submitDisabled`** (`handleQuickBook`'s enable/disable logic doesn't reference `laterRoomAvailability` at all). It's cosmetic — clicking Confirm on a room flagged "conflict" still hits the real API and can succeed if the badge was wrong. Worth knowing when triaging a similar report: a scary-looking red label in this modal is not proof the server will reject the booking, and a calm green "available" is not proof it will accept it — only the actual submit response is authoritative. This is now noted in [the booking-submit-failing runbook](../runbooks/booking-submit-failing.md).
