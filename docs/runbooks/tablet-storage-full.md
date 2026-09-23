# Runbook: Tablet storage is full

**Symptom:** A tablet running the room display page shows an OS-level "Device storage is low" prompt (Fire OS's own "Turn on Auto Archive" / "Free Up Space" dialog, not anything from Spacebook). Checking Storage in Settings shows the device close to 100% full, with almost nothing attributable to Photos, Music, Games, or "Other apps" — the bulk sits in "System." "Free Up Space" typically finds only a few MB reclaimable (e.g. a leftover Fully Kiosk Browser `.apk` installer in Downloads), nowhere near enough to explain the gap.

Confirmed 2026-09-22, happening across every tablet in one workspace at once — the only things installed on any of them are Fully Kiosk Browser and Spacebook.

**Status: at least one real cause identified 2026-09-23, but it does not explain every affected tablet — investigation ongoing.** On one tablet: 11 unapplied Fire OS system updates queued since December 2025 (last applied version: Fire OS 8.3.3.8) — see "Cause #1" below, confirmed as a real, structural issue for kiosk tablets regardless of whether it turns out to be the only one here. However, a second affected tablet shows the identical symptom with **zero pending updates** — so this is not a universal single-cause explanation across the fleet. Don't assume a tablet's storage issue is the stuck-updates problem without checking `System Updates` on that specific device first; if it comes back empty, the cause is still open (see "Cause #2 (suspected, unconfirmed)" below).

---

## What this isn't

**Not Spacebook writing to local storage.** Checked directly — Spacebook's own storage footprint is negligible and can't be the cause, on any tablet, regardless of uptime:
- The tablet-snapshot feature ([ADR-011](../decisions/011-tablet-screenshot-approach.md)) renders in-memory via html2canvas and POSTs the JPEG straight to the server — it never touches the tablet's local filesystem.
- Every `localStorage` key the app uses (`spacebook_user`, `sb_error_report`) holds a single small value that gets overwritten in place on every write, never appended to or accumulated.
- There's no service worker, no PWA manifest, no Cache API usage, and no custom `Cache-Control` headers in `next.config.js` — nothing configured to cache aggressively on purpose.

**Not Fully Kiosk Browser's own cache of Spacebook's build output either — checked and ruled out 2026-09-23.** The initial hypothesis was that Next.js's default `Cache-Control: public, max-age=31536000, immutable` on every `/_next/static/` bundle, combined with a kiosk browser that never closes and is rarely cleared, would let every historical deploy's bundles accumulate forever in the browser's HTTP cache. This was a reasonable theory and would explain the "all tablets, same time, only two apps installed" pattern — but checking Fully Kiosk Browser's own Android App Info screen disproved it directly: **App size 15.25MB, User data 4.5MB, Cache 18.33MB** — under 40MB total for the entire app, nowhere close to accounting for a device reporting 25GB+ used. If accumulated build bundles were the problem, Fully Kiosk's own cache figure would be enormous, not 18MB.

---

## Cause #1 (confirmed on at least one tablet): Fire OS auto-update structurally can't run on an always-on kiosk tablet

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

## Cause #2 (suspected, unconfirmed) — a second tablet has the same symptom with zero pending updates

Found 2026-09-23: not every affected tablet has queued updates. One tablet shows the same near-full storage / "System" ballooning with `System Updates` reporting nothing pending. **Don't assume Cause #1 applies to a given tablet without checking `System Updates` on that specific device first.**

Leading suspects for this tablet, not yet confirmed — need the same diagnostic pass repeated on it:
1. **Orphaned update packages left behind after a past *successful* install.** A distinct, separately-known Android/Fire OS bug pattern from Cause #1: even when an update installs correctly, the downloaded package file sometimes isn't cleaned up from the cache/system partition afterward. This would explain "no pending updates" (it genuinely finished updating) while still having a bloated system partition. Check whether this tablet's Fire OS version/last-updated date is actually current (not stuck at Dec 2025 like the other one) — if it's on a recent version, this is the more likely explanation than Cause #1 for this specific device.
2. **A different category is actually the real driver on this tablet**, not "System" at all. Get the full Storage breakdown (Photos/Music/Games/Movie & TV apps/Other apps/Files/System, each with its GB figure) for this tablet specifically before assuming it matches the first tablet's pattern — "Other apps" was already a non-trivial 2.8GB on the first tablet and was never investigated further since "System" was clearly dominant there. It may not be dominant here.

Until this is confirmed, treat Cause #1's fix (installing queued updates) as necessary-but-possibly-not-sufficient across the whole fleet — check each tablet's own `System Updates` screen individually rather than assuming the first tablet's diagnosis generalizes.

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
