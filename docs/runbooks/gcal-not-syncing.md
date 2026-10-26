# Runbook: GCal not syncing

**Symptom:** External Google Calendar events are no longer creating conflicts or being rejected. Bookings made in Spacebook may or may not be appearing in the calendar. The room shows "GCal connected" in the admin panel but sync has silently stopped.

---

## How GCal sync works (quick orientation)

Spacebook uses Google Calendar push notifications (webhooks), not polling. When a room is connected, Spacebook registers a webhook channel with Google. Google calls `POST /api/{workspace}/gcal/webhook` whenever the calendar changes. Each webhook registration is valid for approximately 7 days; a Vercel cron job at `GET /api/gcal-renew` (runs daily at 2 AM UTC) renews channels that are within 2 days of expiry.

The watch state (channel ID, resource ID, expiration, sync token, webhook token) is stored in Redis under `gcal:watch:{roomId}`.

---

## Step 0: Quick triage — how long has sync actually been dead?

Before digging into Redis or Vercel logs, get a sense of scope with one query. `bookings.origin = 'gcal'` is only ever written by the inbound webhook (`processWebhook()` in `app/api/[workspace]/gcal/webhook/route.ts`), so its most recent `created_at` is a direct measure of "when did the webhook last actually fire, for any room in this workspace":

```sql
select id, title, room_id, start_time, origin, created_at
from bookings
where origin = 'gcal'
order by created_at desc
limit 5;
```

If the most recent row is days or weeks old — not just "since the last time someone happened to create a conflicting external event" — the webhook has likely been silently dead for that whole span, not intermittently flaky. This is a materially different problem to communicate than "sync seems slow": nothing has been coming through at all, and every external calendar change since then (including someone deleting an event, which is supposed to un-cancel/re-sync the corresponding booking) has been silently dropped. Go straight to Step 1 (Redis watch state) once you know this.

**Known incident, resolved 2026-09-17:** first found for the `plonk-mango-wizard` workspace, South Conference Room — no `gcal`-origin booking since 2026-08-25, despite the room showing "✓ GCal" connected in the admin panel and new events genuinely landing on the room's Google Calendar. Confirmed a second time live the next day: a meeting booked directly on the room's Google Calendar for Thursday 2–3pm did not appear in Spacebook.

Once the sync-health check (below) shipped and ran for real, it turned out **all 5 rooms in the workspace** had lost their watch registration, not just South Conference Room — `gcal:watched_rooms` in Redis was empty, but every room's OAuth tokens were still valid. Exact root cause of how the watch state was lost in the first place was never pinned down (Redis has no audit log for this), but all 5 were fixed in under a minute using the fast path in "Fix: Re-register the watch" below — none needed a real OAuth reconnect. A 6th flagged room ("Meeting Room 1", a different workspace) turned out to be a test workspace that had since been deleted, not a real incident.

**This is now caught automatically (added 2026-09-16).** `GET /api/gcal-renew` — the same daily cron that renews watch channels — also cross-checks every GCal-connected, active room against its Redis watch state after each run (`checkSyncHealth` in that route). A room with no watch state at all, an expired-and-unrenewed watch, or a renewal that failed that run gets flagged, and if anything's flagged, one email goes out via `sendGcalSyncHealthEmail` (`lib/email.ts`) to every address in `PALANTIR_ADMINS`. Silence means healthy — it does not send a daily "all clear," only alerts when something needs attention. If a real outage isn't producing this email, check that `PALANTIR_ADMINS` and `RESEND_API_KEY` are actually set in Vercel production, and that the cron itself is running (Step 3).

**False-positive bug, fixed 2026-09-17:** the check's first version filtered on `rooms.google_calendar_id IS NOT NULL` alone, which flagged every room that had *ever* had a calendar picked — including rooms that were legitimately disconnected later or never finished connecting — because disconnect (`app/api/[workspace]/gcal/disconnect/[roomId]/route.ts`) removes tokens and watch state but never clears `google_calendar_id`. The first real run emailed 6 rooms across 2 workspaces as broken; only one (South Conference Room) was an actual live incident. Fixed by also requiring `hasTokens(roomId)` — the same signal the app's own "gcal_connected" indicator uses — before considering a room's watch state meaningful. If this check starts over-reporting again, suspect the same class of bug: something making a room look "connected enough to need a watch" by a query that doesn't match what the app itself considers connected.

**Recurring incident, 2026-09-23/24 — same workspace, second time:** the sync-health email fired again, flagging all 5 `plonk-mango-wizard` rooms (shown to users as workspace name "MAP") with "no watch channel registered" — the exact same failure, the exact same workspace, ~7 days after the first incident above was fixed. This was initially reported as a different workspace ("MAP") until cross-checking the room list (Recording Studio, South Conference Room, E1, NW, SW) against the admin panel confirmed it's `plonk-mango-wizard` again, not a new workspace with a coincidentally identical room named "South Conference Room." Fixed the same way — the fast path below, all 5 rooms, under a minute, tokens still valid.

This time the root cause has a real lead: see [ADR-019](../decisions/019-gcal-watch-state-not-deleted-on-token-miss.md). Short version — the renewal cron used to delete a room's watch state the instant a token lookup came back empty, with no way to tell a real revoke from a transient read failure, and since a batch of rooms fixed together via the fast path also expires together, one bad read during the cron's renewal window could wipe an entire workspace's rooms at once. That destructive delete is now removed (a token-fetch miss is treated as a renewal error, not grounds for deletion). The trigger for the bad read itself (KV eviction, network blip, something else) is still unconfirmed — this session had no access to Vercel cron logs or the Upstash dashboard to check. All 5 rooms were just re-registered together again, so they'll cluster for renewal again around **2026-09-30**; if the alert fires again around then, that's the window to actually pull logs instead of fast-pathing a third time.

---

## Step 1: Check whether a watch state exists

Open the Upstash console for your Redis database (or use any Redis client with your `KV_REST_API_URL` and `KV_REST_API_TOKEN`).

```
GET gcal:watch:{roomId}
```

Replace `{roomId}` with the UUID of the affected room (visible in the URL when editing the room in the admin panel).

**If the key is missing:** The watch was never registered, was stopped, or was cleaned up. Proceed to "Fix: Disconnect and reconnect."

**If the key exists:** Check the `expirationMs` field. Compare it to the current Unix timestamp in milliseconds (`Date.now()` in a browser console). If `expirationMs` is in the past, the watch expired and hasn't been renewed. Check whether the cron job is running (see Step 3).

Also check `webhookToken` — if this field is missing from the stored state, the room was connected before PR #72 (which added HMAC signature verification). The webhook handler now rejects requests with no matching token. Disconnect and reconnect to generate a fresh token.

---

## Step 2: Check the app URL

Webhook callbacks are registered with the URL `{NEXT_PUBLIC_APP_URL}/api/{workspace}/gcal/webhook`. If the app URL changed since the webhook was registered (e.g. a domain migration), Google is calling the old URL.

Check: does `NEXT_PUBLIC_APP_URL` in Vercel match the URL where the app is actually running? If the domain changed, all rooms need to be disconnected and reconnected (see "Fix" below).

---

## Step 3: Check whether the renewal cron is running

In the Vercel dashboard → your project → **Logs**, filter for `gcal-renew`. The cron runs at 2 AM UTC daily. If you don't see recent entries, check:

- Is `CRON_SECRET` set in Vercel's production environment variables? If it's missing, the cron endpoint rejects the request as unauthenticated.
- Is there a `vercel.json` in the repo with the cron definition? Check that `{ "path": "/api/gcal-renew", "schedule": "0 2 * * *" }` is present.

You can manually trigger renewal by calling the endpoint with the cron secret:

```bash
curl -X GET https://your-app.com/api/gcal-renew \
  -H "Authorization: Bearer {CRON_SECRET}"
```

Check the response — it will list how many watches were renewed.

---

## Step 4: Check for Google API errors

In Vercel logs, search for `[gcal webhook]` or `[gcal watch]`. Common errors:

- `invalid_client` / `invalid_grant` — The OAuth refresh token has been revoked. The user who authorised the GCal connection may have revoked Spacebook's access in their Google Account settings. Disconnect and reconnect.
- `403 Forbidden` on calendar events — The Google account used for OAuth no longer has access to the calendar. Check that the Google account can still see the calendar in Google Calendar.
- `410 Gone` on a watch renewal — The calendar ID no longer exists or the channel was stopped externally. Disconnect and reconnect.

---

## Fix: Re-register the watch (fast path — try this first)

If the room's OAuth tokens are still valid (`hasTokens(roomId)` true — the sync-health email only flags rooms where this is already the case, see below), you don't need to touch the OAuth connection at all. `POST /api/{workspace}/gcal/watch` with `{ "room_id": "<uuid>" }` re-registers a fresh watch channel using the existing tokens and adds the room back into `gcal:watched_rooms` for future renewal — no Google re-consent, no disconnect.

```bash
curl -X POST https://your-app.com/api/{workspace}/gcal/watch \
  -H "Content-Type: application/json" \
  -d '{"room_id":"<room-uuid>"}'
```

**Fixed 2026-09-17:** this endpoint (plus `/gcal/calendars` and the global `/gcal/disconnect`) had no auth check at all, and `CRON_SECRET` was unset in production so `/api/gcal-renew`'s own check was a no-op. All three routes now require the same `admin_{workspace}`/`palantir_session` cookie every sibling admin route already required, and `CRON_SECRET` is set. If you're calling `/gcal/watch` manually per the fast path above, you'll now need a real admin session (or `palantir_session` for the global disconnect) — the unauthenticated curl example earlier in this doc's history no longer works, by design.

A deeper, pre-existing note surfaced while fixing this and *not* addressed: the `admin_{workspace}` cookie's value is a predictable string (`'admin'`/`'super_admin'`), not a signed or random token — see [ADR-001](../decisions/001-slug-as-secret-auth.md). httpOnly and SameSite stop a browser-based attacker from forging it, but a raw HTTP client that could get an arbitrary header accepted would not be stopped by presence-checking alone. This is the same pattern already used by every admin-gated route in the app (not something introduced here), and hardening it would mean signing the cookie value app-wide — a real architectural decision, not a quick fix. Worth revisiting if this workspace's data sensitivity ever changes from ADR-001's stated threat model ("someone forwarded the wrong link," not "a hostile actor is targeting us").

This is how the 2026-09-17 incident below was actually resolved — used to fix 5 rooms in one workspace in under a minute, none of which needed a real reconnect.

Verify it worked: re-run `GET /api/gcal-renew` (see Step 3) and confirm the room no longer appears in `unhealthyRooms`, or create a test event on the connected Google Calendar and check it appears in Spacebook within a couple of minutes.

## Fix: Disconnect and reconnect (only if tokens are actually gone)

Use this if the fast path above fails, or if `hasTokens(roomId)` is false (the room shows disconnected, not just watch-less). This is the only path that gets you fresh tokens — it re-registers the webhook with the current app URL, generates a fresh webhook token, and stores a fresh OAuth token via a full Google consent flow.

1. Go to **Admin panel → Rooms**
2. Find the affected room — it should show **✓ GCal** if connected
3. Click **✓ GCal** and confirm disconnect
4. After disconnect, click **+ GCal** and complete the OAuth flow again
5. After reconnecting, the room will prompt you to select a calendar. Pick the same calendar as before.

After reconnection, verify:
- `GET gcal:watch:{roomId}` in Redis shows a new entry with a future `expirationMs` and a non-empty `webhookToken`
- Create a test event in the connected Google Calendar at a time that conflicts with an existing Spacebook booking — you should receive a conflict rejection email within a few seconds

---

## Fix: Multiple rooms stopped at once (app URL change)

If the app URL changed and all rooms stopped syncing simultaneously, you need to reconnect every room. There is no bulk operation — repeat the disconnect/reconnect process for each room that had GCal enabled.

Before reconnecting, verify `NEXT_PUBLIC_APP_URL` in Vercel is set to the new URL and has deployed. The reconnection will register webhooks against the current value of `NEXT_PUBLIC_APP_URL`.

---

## Historical gap: recurring bookings created before 2026-08-24 never synced out to GCal at all

Commit `187d985` (2026-08-24) was the first version of `POST /api/[workspace]/bookings` that called `createCalendarEvent` for recurring-series occurrences at all — before it, only one-off bookings synced. Because a recurring series inserts every occurrence row up front (all the way to `series_end`, capped at one year out), any series created before that commit has occurrence rows — including ones dated well into the future — that never had a GCal event created and never will, on their own. Nothing retroactively revisits old rows; there's no cron or resync mechanism, only the create-time write.

`scripts/backfill-gcal-recurring.ts` is a one-time (not scheduled, not wired into the app) script written to fix this: dry-run by default, `--execute` to actually create the missing events. As of 2026-09-15 it has **not been run successfully** — it needs `SUPABASE_SERVICE_ROLE_KEY`, which is marked as a sensitive environment variable in this Vercel project, so `vercel env pull` writes it as an empty string instead of the real value. Revealing it requires either adjusting that variable's sensitivity in Vercel's dashboard or running the script from a context that already has legitimate access to the real value. Until it's run, expect to keep finding old-series occurrences with `google_event_id IS NULL` and no explanation beyond "it predates the fix."

## Known non-issues

**GCal sync delay.** Google push notification delivery is not instantaneous. In normal operation there can be a 30–120 second delay between an event being added to a Google Calendar and Spacebook receiving the webhook. This is expected.

**Bookings created in Spacebook not appearing in GCal.** Spacebook writes bookings to GCal when they are created (via the `POST /api/{workspace}/bookings` route). If this is failing, check Vercel logs for `[gcal write]` errors. This is independent of the push notification webhook — the webhook path is Google → Spacebook; the booking write path is Spacebook → Google.

**A disabled room's external calendar events aren't appearing in Spacebook.** This is expected, not a sync failure. `is_active: false` on a room makes the webhook handler skip mirroring new external events into Spacebook entirely (no booking created, no conflict check, no email) — see [ADR-015](../decisions/015-disable-room-leaves-gcal-connected.md). The watch state, tokens, and GCal connection are untouched, so this only affects rooms that are currently disabled. Check `is_active` on the room before treating this as a bug.
