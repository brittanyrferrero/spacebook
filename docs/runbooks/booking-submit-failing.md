# Runbook: Booking fails or shows an error on submit

**Symptom:** A user clicks "Book Now" or "Confirm" and either nothing happens, an error message appears in the modal, or the booking appears to succeed but doesn't show up on the calendar.

---

## Quick triage: which path are they on?

There are three distinct booking submit paths. Each has different validation layers.

| Surface | Button | Function | Error display |
|---|---|---|---|
| Desktop booking page (`/{workspace}`) | "Book Now" or "Confirm" | `handleQuickBook` in `(booking)/page.tsx` | Inline `mError` below the form |
| Room detail page (`/{workspace}/room/{id}`) week/month view | "BOOK NOW" → duration buttons | `handleWalkIn` in `room/[roomId]/page.tsx` | `walkInError` below the duration buttons |
| Tablet / room detail day view | Quick duration buttons | `handleWalkIn` | Same as above |

Ask the user: which page and which button? That tells you which path to check.

---

## handleQuickBook — client-side guards (desktop booking page)

These fire before any network request. No error is shown to the user for the first one.

### Silent no-op (nothing happens on click)

**Cause:** Required fields are missing — `!room || !mName || !mEmail || !mTime || !mEndTime`.

**Check:** Is the "Confirm" button greyed out or unclickable? The button disables when `!mTime || !mEndTime || mEndTime <= mTime`. If the button appears active but nothing happens, open the browser console and look for any JS errors.

**Fix:** Ensure name, email, start time, and end time are all filled in. Start time and end time must both be set to valid 15-minute increments.

---

### "End time must be after start time."

**Cause:** `endTime <= startTime` — shown inline below the time pickers, and the Confirm button is also disabled.

**Fix:** Adjust end time to be after start time.

---

### "Start time is in the past."

**Cause:** `showModal === 'later'` and `new Date(startTime) < now`. The date/time the user picked is in the past.

**Important:** This check is intentionally skipped for `showModal === 'now'` (Book Now). If a user is hitting this error from the "Book Now" flow, that is a bug — see [ADR-008](../decisions/008-book-now-time-semantics.md).

**Fix:** Change the date or start time to a future value.

---

## handleQuickBook — server errors

These come back as HTTP errors from `POST /api/{workspace}/bookings`.

### "Missing required fields." (400)

Room ID, name, email, start time, or end time is absent in the POST body. Should not happen through the normal UI — if you're seeing this, a field is being cleared between the user filling it in and the submit firing. Check for any `useEffect` or event handler that clears `mName`, `mEmail`, `mTime`, or `mEndTime` unexpectedly.

---

### "Invalid email address." (400)

The email fails the server-side `isValidEmail` check (`lib/email.ts`). The client does not currently validate email format before submit. Check that the email field contains a valid address.

---

### "Booking limit reached. Upgrade to continue making bookings." (403)

The workspace has hit its `max_bookings` trial limit. Check the limit in Redis:

```
GET ws:{workspaceId}:limits
```

To increase the limit, use the Palantir super-admin panel to edit the workspace's `WorkspaceLimits`. Setting `max_bookings: null` removes the cap entirely.

---

### "Too many requests." (429)

The booking endpoint rate-limits to 20 requests per minute per IP. Legitimate users will not normally hit this. If they are:

- A kiosk tablet is retrying aggressively after a failed booking — check the tablet for a JS error causing a loop
- A corporate proxy is sending all office traffic from one IP — the current rate limit has no per-workspace override; contact Palantir to adjust if needed

---

### "Forbidden." (403) — edit or cancel rejected

**Symptom:** A user tries to edit or cancel a booking from their "My Bookings" page (`/{workspace}/my-bookings`) and gets a 403.

**Cause:** The `PATCH` or `DELETE` request to `/api/{workspace}/bookings/{id}` requires the caller to be either a workspace admin (`admin_{slug}` cookie) or the verified booking owner (`mb_{workspace}` cookie with an email matching `booking.booker_email`).

The `mb_{workspace}` cookie is set when a user verifies their email via the "My Bookings" magic link. It is tied to the browser and device where they clicked the link. If they are accessing from a different browser or device, the cookie won't be present.

**How to diagnose:**
1. Open DevTools → Application → Cookies. Look for an `mb_{slug}` cookie (e.g. `mb_amber-oak-vale`).
2. If missing: the user hasn't verified their email in this browser session. They need to re-request a magic link from `/{workspace}/my-bookings` and click it in this browser.
3. If present but stale: check that the email in the cookie matches the `booker_email` on the booking. If the booking was made with `alice@example.com` and the cookie holds `Alice@example.com`, the comparison is case-insensitive and should still pass. If they are genuinely different emails, the user cannot claim ownership — an admin must make the change.
4. If the booking was made as a walk-in (`walkin@tablet.spacebook.app`), no `mb_` cookie can claim ownership — only an admin can edit or cancel walk-in bookings.

**Fix:**
- User on wrong device: send them a new magic link from `/{workspace}/my-bookings`.
- Walk-in booking: admin edits via the admin panel or by hitting the API with an admin cookie.

---

### Conflict — booking rejected, alternatives shown (409)

The time slot is already taken. The UI shows the conflicting booking and (if configured) alternative rooms. This is expected behaviour, not an error.

If a user reports a conflict on a slot that appears free on the calendar:

1. The calendar may be stale — it refreshes every 60 seconds. Wait and reload.
2. A recurring booking may cover that slot without appearing individually on the calendar view. Check the admin panel for recurring series.
3. There may be a timezone mismatch — check that the workspace's display timezone matches the user's local clock.

---

### "Something went wrong. Please try again." (500 or unparseable response)

Server error. Check Vercel function logs for the relevant `POST /api/{workspace}/bookings` invocation. Common causes:

- Supabase connection failure — see [supabase-errors runbook](supabase-errors.md)
- GCal write failure (non-fatal; booking still saves, but GCal event creation logs an error) — search logs for `[gcal write]`
- Recurring series generation error — if the booking had a recurrence rule, check that `series_end` is within 1 year of today

---

## handleWalkIn — tablet / room page duration buttons

`handleWalkIn` has no client-side time guards. It calls `POST /api/{workspace}/bookings` with `new Date()` as the start time. All errors come back from the server and appear below the duration buttons as `walkInError`.

The same server-side causes above apply. One additional case:

### Walk-in booking conflicts with a just-ended meeting

The walk-in start time is the exact current millisecond. If the previous booking ended at (e.g.) `14:00:00.000` and the walk-in starts at `14:00:00.001`, the exclusion constraint will not fire. But if there is any clock drift between the tablet and the server, or the previous booking hasn't ended yet in the DB (e.g. it was bulk-imported with a rounded end time), a conflict can appear.

**Fix:** Wait for the current booking to show as ended on the tablet display (it checks every 60 seconds), then try again. If it persists, check the `end_time` on the conflicting booking in Supabase — it may need a manual correction.

---

## Booking appears to succeed but doesn't show up

1. **Optimistic update:** After a successful booking, the UI adds the booking to local state immediately and also triggers a re-fetch. If the booking appears for a moment then disappears, the re-fetch may be returning stale data. Check Vercel logs for the `GET /api/{workspace}/bookings` call that fires after the POST.

2. **Wrong date:** `handleQuickBook` uses `mDate` (the modal's date field) to construct the ISO timestamp. If `mDate` drifted to a different day (e.g. the modal was opened just before midnight), the booking was created on that day. Check the admin panel's full booking list, not just today's view.

3. **Cancelled on creation:** The GCal sync path can mark a booking as cancelled if it immediately conflicts with a pre-existing Google Calendar event. Check `cancelled_at` on the booking row in Supabase.

---

## Known non-issues

**"Start time is in the past" for Book Now.** If this appears for `showModal === 'now'`, it is a regression — that check should be guarded by `showModal === 'later'`. See [ADR-008](../decisions/008-book-now-time-semantics.md).

**Confirm button stays greyed out after filling in all fields.** This happens when start time equals end time, or when `mEndTime <= mTime` (string comparison). Verify the end time is strictly after the start time and both are valid 15-minute increments (00/15/30/45).
