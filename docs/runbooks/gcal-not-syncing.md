# Runbook: GCal not syncing

**Symptom:** External Google Calendar events are no longer creating conflicts or being rejected. Bookings made in Spacebook may or may not be appearing in the calendar. The room shows "GCal connected" in the admin panel but sync has silently stopped.

---

## How GCal sync works (quick orientation)

Spacebook uses Google Calendar push notifications (webhooks), not polling. When a room is connected, Spacebook registers a webhook channel with Google. Google calls `POST /api/{workspace}/gcal/webhook` whenever the calendar changes. Each webhook registration is valid for approximately 7 days; a Vercel cron job at `GET /api/gcal-renew` (runs daily at 2 AM UTC) renews channels that are within 2 days of expiry.

The watch state (channel ID, resource ID, expiration, sync token, webhook token) is stored in Redis under `gcal:watch:{roomId}`.

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

## Fix: Disconnect and reconnect

This is the standard fix for most GCal sync issues. It re-registers the webhook with the current app URL, generates a fresh webhook token, and stores a fresh OAuth token if needed.

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

## Known non-issues

**GCal sync delay.** Google push notification delivery is not instantaneous. In normal operation there can be a 30–120 second delay between an event being added to a Google Calendar and Spacebook receiving the webhook. This is expected.

**Bookings created in Spacebook not appearing in GCal.** Spacebook writes bookings to GCal when they are created (via the `POST /api/{workspace}/bookings` route). If this is failing, check Vercel logs for `[gcal write]` errors. This is independent of the push notification webhook — the webhook path is Google → Spacebook; the booking write path is Spacebook → Google.

**A disabled room's external calendar events aren't appearing in Spacebook.** This is expected, not a sync failure. `is_active: false` on a room makes the webhook handler skip mirroring new external events into Spacebook entirely (no booking created, no conflict check, no email) — see [ADR-015](../decisions/015-disable-room-leaves-gcal-connected.md). The watch state, tokens, and GCal connection are untouched, so this only affects rooms that are currently disabled. Check `is_active` on the room before treating this as a bug.
