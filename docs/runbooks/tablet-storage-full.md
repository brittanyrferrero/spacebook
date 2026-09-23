# Runbook: Tablet storage is full

**Symptom:** A tablet running the room display page shows an OS-level "Device storage is low" prompt (Fire OS's own "Turn on Auto Archive" / "Free Up Space" dialog, not anything from Spacebook). Checking Storage in Settings shows the device close to 100% full, with almost nothing attributable to Photos, Music, Games, or "Other apps" — the bulk sits in "System." "Free Up Space" typically finds only a few MB reclaimable (e.g. a leftover Fully Kiosk Browser `.apk` installer in Downloads), nowhere near enough to explain the gap.

Confirmed 2026-09-22, happening across every tablet in one workspace at once — the only things installed on any of them are Fully Kiosk Browser and Spacebook.

**Status: root cause identified 2026-09-23, confirmation (storage drop after update) pending.** A first hypothesis (kept below for the record — it's a real thing worth knowing, and a future investigation may want to rule it back in for a different symptom) was tested directly against Fully Kiosk Browser's own Android app-storage numbers and disproven. The actual cause: 11 unapplied Fire OS system updates queued since December 2025 (last applied update: Fire OS 8.3.3.8). See "The actual cause" below.

---

## What this isn't

**Not Spacebook writing to local storage.** Checked directly — Spacebook's own storage footprint is negligible and can't be the cause, on any tablet, regardless of uptime:
- The tablet-snapshot feature ([ADR-011](../decisions/011-tablet-screenshot-approach.md)) renders in-memory via html2canvas and POSTs the JPEG straight to the server — it never touches the tablet's local filesystem.
- Every `localStorage` key the app uses (`spacebook_user`, `sb_error_report`) holds a single small value that gets overwritten in place on every write, never appended to or accumulated.
- There's no service worker, no PWA manifest, no Cache API usage, and no custom `Cache-Control` headers in `next.config.js` — nothing configured to cache aggressively on purpose.

**Not Fully Kiosk Browser's own cache of Spacebook's build output either — checked and ruled out 2026-09-23.** The initial hypothesis was that Next.js's default `Cache-Control: public, max-age=31536000, immutable` on every `/_next/static/` bundle, combined with a kiosk browser that never closes and is rarely cleared, would let every historical deploy's bundles accumulate forever in the browser's HTTP cache. This was a reasonable theory and would explain the "all tablets, same time, only two apps installed" pattern — but checking Fully Kiosk Browser's own Android App Info screen disproved it directly: **App size 15.25MB, User data 4.5MB, Cache 18.33MB** — under 40MB total for the entire app, nowhere close to accounting for a device reporting 25GB+ used. If accumulated build bundles were the problem, Fully Kiosk's own cache figure would be enormous, not 18MB.

---

## The actual cause: Fire OS auto-update structurally can't run on an always-on kiosk tablet

Checked `Settings → Device Options → System Updates` on an affected tablet: running Fire OS 8.3.3.8 (last applied December 2025), with **11 system updates downloaded and queued, never installed**.

The reason this happens specifically to these tablets, and will keep happening indefinitely unless addressed structurally: Fire OS applies queued updates during an idle/charging maintenance window (screen off, plugged in, no user interaction for some period). A kiosk tablet running Fully Kiosk Browser with the room display always on is deliberately configured to *never* go idle — that's the whole point of the deployment. So updates download normally (Fire OS does that regardless of idle state) but the install step's trigger condition can never be satisfied, and they just accumulate, each one's downloaded package sitting in the system partition, indefinitely. Nine months of accumulation (Dec 2025 → Sep 2026) across 11 updates is consistent with a device reporting 25GB+ used with almost nothing attributable to any actual app.

This is not a one-time cleanup problem — it will recur on every tablet run this way, forever, because the always-on requirement and Fire OS's idle-only auto-update mechanism are in direct, structural conflict. **The fix is a recurring manual maintenance task, not a one-time fix.**

### Immediate fix (per tablet)
1. `Settings → Device Options → System Updates` → install all queued updates. Do this on **one tablet first** — Fire OS may not chain all 11 automatically (you may need to tap Install again after each reboot), and this can take 30–60+ minutes with multiple reboots. Do it at a time when that room's display being briefly dark isn't disruptive.
2. After it finishes, confirm the tablet comes back into Fully Kiosk / the room display automatically rather than dropping to the normal Fire OS home screen — a large version jump can occasionally reset default-launcher/kiosk-lock settings. Re-apply Fully Kiosk's kiosk/default-launcher settings if needed.
3. Confirm it's still authenticated to Spacebook (should be unaffected, but worth a glance given everything else about this tablet).
4. Re-check the Storage screen — "System" usage should drop substantially. Once confirmed on this tablet, repeat for the rest.

### Ongoing prevention
Add a recurring check (quarterly is reasonable) to manually open `System Updates` on every tablet and install anything queued, rather than assuming Fire OS is handling it in the background the way it would on a normal, regularly-idle personal tablet. There is currently no automated way to detect this from Spacebook's side — it's entirely outside the app, on the device/OS layer — so this has to be a calendar reminder or part of an existing recurring tablet-maintenance pass, not something this codebase can alert on.

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
