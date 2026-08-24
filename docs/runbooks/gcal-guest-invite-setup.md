# Runbook: setting up guest-invite booking for a room

**What this covers:** the one-time manual step an admin does per room so that people can book it by inviting its calendar as a guest on an event in their own Google Calendar, instead of creating the event directly on the room's calendar or through Spacebook's UI. Design background: [ADR-016](../decisions/016-gcal-guest-invite-booking.md).

This is **not automatic**. Spacebook does not (and currently cannot, without an OAuth scope change — see ADR-016) configure Google Calendar sharing on your behalf. If this step is skipped, bookers will see the room's calendar address in the booking modal and try to invite it, and nothing will happen — the invite silently never reaches the room's calendar, because Spacebook wasn't given permission to see it.

---

## Prerequisite

The room must already be GCal-connected (**Admin panel → Rooms → + GCal**, then pick a calendar). Hovering the **✓ GCal** pill on a connected room shows the calendar's address and a reminder of this step.

Use a calendar dedicated to the room, not the connecting account's personal/primary calendar. Once shared per the step below, anything already on that calendar becomes similarly exposed.

## Step 1: Share the room's calendar

1. Sign in to Google Calendar as the account that owns the room's calendar (the one used to connect it in Spacebook)
2. In the left sidebar, find the calendar, click the **⋮** next to it → **Settings and sharing**
3. Under **Share with specific people or groups**, click **Add people and groups**
4. Instead of adding a specific person, use **Access permissions for [everyone] / Make available to public** (the wording varies slightly by Google Calendar UI version) — set permission to **Make changes to events**
5. Save

This intentionally makes the calendar writable by anyone who knows its address — see ADR-016 for why that's the correct default here (it mirrors the same "the ID is the secret" trust model Spacebook's workspace slugs already use). Do **not** grant **Make changes and manage sharing** — that would let an outside invite also alter this sharing setting or disconnect other guests.

## Step 2: Verify it worked

1. From a *different* Google account (ideally one outside your org, to catch a domain-restricted misconfiguration), create a test event on that account's own calendar
2. Add the room's calendar address (visible via the booking modal's "Prefer booking from your own calendar?" box, or the admin panel's GCal tooltip) as a guest
3. Within roughly 30–120 seconds, a corresponding booking should appear in Spacebook for that room (see [gcal-not-syncing.md](gcal-not-syncing.md) for the normal sync-delay expectations and what to check if it never arrives)
4. Delete the test event afterward

If the booking never appears, it's almost always the sharing permission — re-check Step 1 before treating it as a sync bug.

## Known limitations

- **No enforcement.** Spacebook can't verify sharing is set correctly, and won't warn if it's wrong or gets changed back later — it lives entirely inside Google Calendar's own settings, outside Spacebook's visibility.
- **Private events.** Whether a private (`visibility: private`) event invited this way leaks its real title into Spacebook is unverified — see the open spike, [issue #160](https://github.com/brittanyrferrero/spacebook/issues/160).
- **Changing the permission later** happens the same way — directly in Google Calendar's sharing settings for that calendar, not in Spacebook.
