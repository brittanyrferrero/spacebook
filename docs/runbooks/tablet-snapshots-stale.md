# Runbook: Tablet snapshots stale or missing in palantir

## What this covers

The palantir overlord view shows a "No screenshot yet" placeholder, or the screenshot is hours old despite the tablet being active. This runbook covers the four distinct failure modes and how to recover from each.

**How snapshots work:** 5 seconds after the tablet page loads, and every 5 minutes thereafter, the page runs html2canvas on its own DOM and POSTs a JPEG to `/api/[workspace]/tablet-snapshot`. The image is stored in Redis with a 48-hour TTL. Palantir fetches it on tab open or when you click Refresh. Every step is silent by design — a failure never crashes the tablet page.

---

## Step 1 — Hit Refresh first

In palantir → Tablets tab, click the **Refresh** button next to the workspace name. This re-fetches whatever is currently in Redis. If the snapshot is there but stale, you'll see the updated timestamp.

If the snapshot is still missing or old after refreshing, continue below.

---

## Step 2 — Check Vercel logs for upload failures

```
vercel logs --limit 100 | grep tablet-snapshot
```

Look for responses to `POST /api/[workspace]/tablet-snapshot`:

| Status | Meaning | Go to |
|--------|---------|-------|
| `200` | Upload succeeded — Redis write may have failed | Step 5 |
| `401` | Tablet lost its `ws_` cookie | Step 3 |
| `413` | Image exceeded 800KB limit | Step 4 |
| `500` | Server error in the route handler | Check Vercel function logs |
| *(no entries)* | Upload never reached the server — html2canvas failing | Step 4 |

---

## Step 3 — 401: tablet lost its session cookie

The `ws_{slug}` cookie has a 10-year browser expiry, but it can be lost if:
- The tablet's browser storage was cleared
- The workspace slug was renamed (slug rename invalidates all existing sessions)
- The tablet was factory reset or a new browser profile was used

**Recovery:**

1. Find the tablet's room entry URL. In the workspace admin panel → Rooms, each room has a "Tablet link" (the `tablet-enter` URL with the token embedded).
2. Open that URL on the tablet. It sets a fresh `ws_` cookie and redirects to the room display page.
3. Wait 5 seconds — the first snapshot will upload automatically.

If the workspace slug was recently renamed and multiple tablets are affected, repeat for each room.

---

## Step 4 — html2canvas failing on the tablet

If there are no `tablet-snapshot` entries in Vercel logs at all, the upload never reached the server. html2canvas is either failing to capture or failing to import. Since errors are swallowed silently at the app level, you need to check the tablet's browser console.

**On a Fire tablet:**
1. Open the Silk browser's developer tools. From a desktop, enable USB debugging on the tablet and connect via `adb`, then open `chrome://inspect` in Chrome to access Silk's console.
2. Alternatively: temporarily add `?debug=1` to the tablet URL and check if a visible error state appears (not implemented yet — see future improvements below).

**Look for** lines prefixed `[snapshot]`:
```
[snapshot] upload failed 413
[snapshot] capture failed Error: ...
```

**Common causes:**
- `canvas size exceeded`: the tablet viewport × device pixel ratio exceeded browser canvas limits. This is unlikely with `scale: 1` but possible on high-DPI tablets. Fix: lower quality or capture a smaller element.
- `Failed to fetch dynamically imported module`: the html2canvas chunk failed to load. Usually a transient network issue — the next 5-minute cycle will retry.
- Memory pressure on low-RAM tablets: html2canvas allocates a canvas equal to the viewport size. Closing other browser tabs frees memory.

**If the image size is the problem (413):** the encoded JPEG exceeded 800KB. This would require a code change to reduce quality or capture dimensions. File an issue.

---

## Step 5 — Snapshot exists in Redis but palantir shows nothing

Verify the key is in Redis:

```
# In a Redis client or Upstash console:
GET tablet:snap:{workspaceId}:{roomId}
```

If the key exists, the GET endpoint may be failing. Check:
- The palantir session cookie is present (sign out and back in to palantir if unsure)
- The request to `/api/{workspace}/tablet-snapshot?roomId={id}` returns 200 in the browser network tab

If the key does not exist despite recent successful POSTs (200 in logs), there may be a Redis write failure. Check the Upstash dashboard for errors or quota limits.

---

## Step 6 — Snapshots disappeared after working previously

**Expected behaviour:** snapshots have a 48-hour TTL. If a tablet is powered off or the page is closed for more than 48 hours, the stored snapshot expires and palantir shows "No screenshot yet" again. This is intentional — a 48-hour-old screenshot of a powered-off tablet is misleading.

**Recovery:** ensure the tablet is on and the browser has the room display page open. The next snapshot uploads 5 seconds after page load.

If tablets are regularly powered off overnight, the 48-hour TTL means Monday morning palantir will show fresh snapshots (uploaded when tablets turn on), not stale weekend ones.

---

## Future improvements worth filing

- A visible in-page indicator (e.g. a tiny dot in the tablet display corner) that confirms the last snapshot time — removes the need for ADB to check the console
- Extend the `error-report` email alert to also fire when snapshot uploads fail repeatedly (three consecutive failures)
- ADB-based OS-level screenshot path for workspaces that need pixel-perfect fidelity
