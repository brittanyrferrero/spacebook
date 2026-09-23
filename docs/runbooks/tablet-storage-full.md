# Runbook: Tablet storage is full

**Symptom:** A tablet running the room display page shows an OS-level "Device storage is low" prompt (Fire OS's own "Turn on Auto Archive" / "Free Up Space" dialog, not anything from Spacebook). Checking Storage in Settings shows the device close to 100% full, with almost nothing attributable to Photos, Music, Games, or "Other apps" — the bulk sits in "System." "Free Up Space" typically finds only a few MB reclaimable (e.g. a leftover Fully Kiosk Browser `.apk` installer in Downloads), nowhere near enough to explain the gap.

Confirmed 2026-09-22, happening across every tablet in one workspace at once — the only things installed on any of them are Fully Kiosk Browser and Spacebook.

**Status: root cause not yet confirmed.** A first hypothesis (below, kept for the record since it's a real thing worth knowing, and a future investigation may want to rule it back in for a different symptom) was tested directly against Fully Kiosk Browser's own Android app-storage numbers and disproven. See "What this isn't" and "Where to look next."

---

## What this isn't

**Not Spacebook writing to local storage.** Checked directly — Spacebook's own storage footprint is negligible and can't be the cause, on any tablet, regardless of uptime:
- The tablet-snapshot feature ([ADR-011](../decisions/011-tablet-screenshot-approach.md)) renders in-memory via html2canvas and POSTs the JPEG straight to the server — it never touches the tablet's local filesystem.
- Every `localStorage` key the app uses (`spacebook_user`, `sb_error_report`) holds a single small value that gets overwritten in place on every write, never appended to or accumulated.
- There's no service worker, no PWA manifest, no Cache API usage, and no custom `Cache-Control` headers in `next.config.js` — nothing configured to cache aggressively on purpose.

**Not Fully Kiosk Browser's own cache of Spacebook's build output either — checked and ruled out 2026-09-23.** The initial hypothesis was that Next.js's default `Cache-Control: public, max-age=31536000, immutable` on every `/_next/static/` bundle, combined with a kiosk browser that never closes and is rarely cleared, would let every historical deploy's bundles accumulate forever in the browser's HTTP cache. This was a reasonable theory and would explain the "all tablets, same time, only two apps installed" pattern — but checking Fully Kiosk Browser's own Android App Info screen disproved it directly: **App size 15.25MB, User data 4.5MB, Cache 18.33MB** — under 40MB total for the entire app, nowhere close to accounting for a device reporting 25GB+ used. If accumulated build bundles were the problem, Fully Kiosk's own cache figure would be enormous, not 18MB.

---

## Where to look next

Since neither Spacebook nor Fully Kiosk Browser's own storage explains it, and the device's Storage screen attributes the overwhelming majority of used space to "System" (not any per-app category), this looks like a Fire OS / system-partition issue independent of anything in this app's stack. Worth checking, in order:

1. **Settings → Device Options → System Updates** — Fire tablets are known to sometimes download an OTA update package and then fail to clean it up after applying it (or get stuck retrying a failed update), leaving a multi-GB file sitting in the system partition indefinitely. Check for a pending or stuck update here first — this is the most common known cause of "System" ballooning on Fire OS specifically.
2. Whether these tablets have been running for a long time without ever being rebooted or factory reset — accumulated system logs/cache in the OS partition itself (not any single app) can bloat over a long uptime on some Fire OS versions, independent of what's installed.
3. If neither turns up anything, this is likely a Fire OS / Amazon vendor-side storage accounting issue rather than something diagnosable further from the app side — a factory reset (after confirming a way to quickly re-provision the tablet: reinstall Fully Kiosk, re-open its Tablet Link, re-lock into kiosk mode) or contacting Amazon device support are the realistic remaining options.

---

## If you still want to clear Fully Kiosk's cache anyway

Clearing Fully Kiosk Browser's cache won't fix this specific storage crisis (see above — its cache is only ~18MB, not the problem), but it's still reasonable, low-risk periodic hygiene for a kiosk tablet, and worth doing carefully if you go there:

Android (and Fully Kiosk Browser's own settings) normally distinguish two genuinely different actions:
- **Clear Cache** — wipes only temporary/cached files. Cookies and login state live in a separate data store and should survive this.
- **Clear Data** / **Clear Storage** — wipes everything, cookies included. This *would* drop the tablet's `ws_{slug}` session cookie (see [tablet-snapshots-stale.md, Step 3](tablet-snapshots-stale.md) for what that looks like and how to recover from it).

Verify which one your Fully Kiosk Browser version actually does before relying on it: clear cache-only on one tablet, confirm it's still showing the room display with no re-login needed, before repeating elsewhere or scheduling it automatically. If it turns out to drop the session too, don't automate it — clear it manually and expect to re-open the room's Tablet Link (workspace admin panel → Rooms) afterward each time.

---

## Related

- [ADR-011: tablet screenshot via html2canvas self-snapshot](../decisions/011-tablet-screenshot-approach.md) — confirms the snapshot feature doesn't write to local storage.
- [tablet-snapshots-stale.md](tablet-snapshots-stale.md) — what a lost `ws_` cookie looks like and how to recover a tablet's session.
