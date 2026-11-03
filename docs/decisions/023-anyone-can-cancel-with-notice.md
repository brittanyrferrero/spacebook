# ADR-023: Anyone can cancel or change a booking, with notice to the booker
Date: 2026-10-06
Status: Accepted

## Context

On the Linen tablet pilot, tapping Cancel on a booking showed "Verify your email under
My Bookings to cancel this booking from here", even for a booking made seconds earlier
on that tablet.

The cause was `05b9476` (Sep 22). The calendar feed stopped sending `cancel_token` to
anyone who isn't an admin or a verified (`mb_`) booker, because the token alone is
enough to cancel through `/api/cancel/[token]`. The tablet is neither, and it refreshes
its bookings right after creating one, which overwrote the one token it had. The web
app had the same gate for anyone who hadn't verified their email.

Letting the tablet keep tokens for a few minutes was rejected: people come back to a
tablet a day later wanting to change or cancel their booking. Tying cancellation to a
tablet credential was also rejected: the same need exists in the web app.

## Decision

Anyone who can open the workspace can cancel or change any booking, on an honour
system, and the booker is always told. Rules live in `lib/booking-access.ts`.

**Direct (no questions, no email):**
- **within 5 minutes of the booking being made** ("oops, wrong time"). Google Calendar
  rows are excluded because their `created_at` is when they synced.
- an admin, or the verified booker (`mb_` cookie matches). **This only ever applies in
  the web app on someone's own computer.** A tablet never knows who is standing at it
  and nobody verifies their email there, so on a tablet the rule is simply: 5 minutes,
  then the questions.

**Walk-ins** (booked at a tablet without a name: placeholder booker email) are treated
like any other booking. "Walk-in" only means we don't know who booked it, not that
nobody did. After 5 minutes the person must say "this was my meeting" or "I have their
permission"; if neither is true, nothing changes. There is no "ask them" option and no
email, because there is no address.

**Otherwise the person picks one of three:**
1. **This was my meeting.** Done now. The booker gets "You cancelled / changed your
   booking…". If it wasn't them, they find out straight away.
2. **I have their permission.** Name required. Done now. The booker gets "{Name}
   cancelled / changed your booking, saying they had your permission."
3. **Ask them to cancel or change it** (not offered for walk-ins). Name and email required, note optional.
   Nothing changes. The booker gets the request (Reply-To the requester, with the note
   and the one-click cancel link) and the requester gets a receipt. The receipt leaves
   out the note, the cancel link and the booker's address: the requester's email is
   typed, not verified, so anything they wrote could otherwise be sent to a stranger's
   inbox from our domain. If the booker frees the time, they reply and tell the
   requester; Spacebook doesn't track requesters or email them later. (An automatic
   "the time is free" email was built and removed: it kept typed addresses for later
   mail, and missed bookings cancelled in Google Calendar.)

Also:
- The feed adds `access: 'direct' | 'needs-reason'` per booking so clients know whether
  to ask. The server re-checks; a stale "direct" gets `400 { code: 'reason_required' }`
  and the client shows the pop-up.
- `cancel_token` is still scrubbed from the feed. It remains the booker's bearer
  credential for the emailed link.
- PATCH now allowlists fields. Anyone may change `start_time`, `end_time`, `title`.
  Only direct access may change `booker_name`/`booker_email`, so nobody can redirect
  another person's booking emails.
- Room blocks (`is_block`) stay admin-only.
- Routes: `POST /api/[ws]/bookings/[id]/cancel`, `POST /api/[ws]/bookings/[id]/request`,
  `PATCH /api/[ws]/bookings/[id]`. Request emails are rate-limited per IP and per
  booking; all user text in emails is escaped.
- Clients: Linen (`OthersBookingModal`) and the web booking page
  (`components/OthersBookingDialog.tsx`). **Classic is not changed**: every workspace is
  moving to Linen and Classic stays frozen (ADR-021).

## Consequences

- **Accepted risk:** the workspace slug is the shared secret (ADR-001), so anyone with
  the link can cancel anything. Nothing stops a false "this was my meeting"; the email to
  the booker is the accountability. This is a deliberate trade for a shared office,
  not a defence against a hostile insider.
- Settles ADR-020's open permissions question: "Finish early" can follow the same rules.
- The old shortcut where PATCH accepted the booking's own `_cancel_token` is replaced by
  the 5-minute window.
- Classic tablets still show "Verify your email" until their workspace switches to Linen.
- **Known mismatch: admin → Settings → "Allow editing others' bookings"** (`allowEditOthers`
  in `bookingVisibility`, off by default). It predates this ADR and was never enforced on
  the server: it only decides whether the web booking page lets you click someone
  else's booking (`othersClickable` in `app/[workspace]/(booking)/page.tsx`). So:
  - with it off (the default), and titles/organisers hidden, web users can't open other
    people's bookings, so they never reach the three-choice pop-up;
  - Linen ignores it, so tablets can cancel or change any booking either way.

  Left as-is for now by decision (2026-10-06). The follow-up is to either remove the
  switch (this ADR's rule replaces it) or enforce it on the server and apply it to the
  tablet too.

## Email times (added 2026-10-06)

Emails used to format times in the server's time zone (UTC on Vercel) with Australian
formatting. Each workspace now has a time zone (`ws:{id}:cfg:timezone`, IANA name):

- Filled in automatically: the tablet, booking page and admin page report the browser's
  zone (`lib/report-time-zone.ts` → `POST /api/[ws]/settings/time-zone`), which only
  sets it when empty (`SET NX`). Changing it needs an admin: Settings → Time zone
  (`PATCH /settings { timeZone }`).
- Every booking email takes `timeZone` and shows US-style times with the zone named,
  e.g. "Tuesday, October 6 · 3:00 – 4:00 PM PDT" (`fmtDate` / `fmtTimeRange` in
  `lib/email.ts`). With no zone set, or an invalid one, times are in UTC and say "UTC".
- The lookup (`lib/time-zone.ts`) never throws: if it fails, the email still goes out
  in UTC.
