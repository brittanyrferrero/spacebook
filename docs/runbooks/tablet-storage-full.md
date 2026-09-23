# Runbook: Tablet storage is full

**Symptom:** A tablet running the room display page shows an OS-level "Device storage is low" prompt (Fire OS's own "Turn on Auto Archive" / "Free Up Space" dialog, not anything from Spacebook). Checking Storage in Settings shows the device close to 100% full, with almost nothing attributable to Photos, Music, Games, or "Other apps" — the bulk sits in "System." "Free Up Space" typically finds only a few MB reclaimable, nowhere near enough to explain the gap.

Confirmed 2026-09-22, happening across every tablet in one workspace at once — the only things installed on any of them are Fully Kiosk Browser and Spacebook.

**Status as of 2026-09-23: confirmed real (not a UI artifact), exact culprit not identified without rooting the device, but the fix is confirmed.** Two plausible hypotheses (stuck Fire OS updates; orphaned update packages) were tested directly and disproven. Pulling real filesystem data via `adb` confirmed the device's `/data` partition genuinely is ~96% full, and narrowed it to "something inside a stock Fire OS system app's private data" — which isn't inspectable without root. **Factory reset is the confirmed correct fix** — see "Confirmed via ADB" and "Resolution" below. The hypotheses below are kept for the record so nobody re-treads them.

---

## What this isn't

**Not Spacebook writing to local storage.** Checked directly — Spacebook's own storage footprint is negligible and can't be the cause, on any tablet, regardless of uptime:
- The tablet-snapshot feature ([ADR-011](../decisions/011-tablet-screenshot-approach.md)) renders in-memory via html2canvas and POSTs the JPEG straight to the server — it never touches the tablet's local filesystem.
- Every `localStorage` key the app uses (`spacebook_user`, `sb_error_report`) holds a single small value that gets overwritten in place on every write, never appended to or accumulated.
- There's no service worker, no PWA manifest, no Cache API usage, and no custom `Cache-Control` headers in `next.config.js` — nothing configured to cache aggressively on purpose.

**Not Fully Kiosk Browser's own cache of Spacebook's build output.** The hypothesis was that Next.js's default `Cache-Control: public, max-age=31536000, immutable` on every `/_next/static/` bundle, combined with a kiosk browser that never closes, would let every historical deploy's bundles accumulate forever in the browser's HTTP cache. Reasonable theory, disproven twice: Fully Kiosk's own Android App Info showed only ~38MB total (app + data + cache combined), and later real `adb shell df -h` data confirmed `/cache` itself was only 9.3MB used out of 516MB. Nowhere close to accounting for a device reporting 20GB+ used.

## Hypothesis #1 (tested, disproven): stuck Fire OS updates

Found 11 Fire OS system updates queued since December 2025, never installed, on one tablet. The theory: Fire OS only auto-installs queued updates during an idle/charging window, and a kiosk tablet configured to always display the room booking screen never goes idle — so updates download but never apply, and their downloaded packages sit around indefinitely.

**Disproven by direct test:** installed all 11 pending updates on that tablet. Storage usage barely moved (~28GB → ~27GB reported "System" — within noise, not a real change). Whatever's actually consuming the space, it isn't queued-but-uninstalled updates.

(The structural point — Fire OS auto-update genuinely can't complete on an always-on kiosk tablet — is still true and worth knowing independent of this specific storage issue. Installing queued updates is still worth doing periodically as general hygiene; it just isn't *this* fix.)

## Hypothesis #2 (tested, disproven): orphaned update packages after a past successful install

A second tablet showed the identical symptom with **zero** pending updates. Theory: maybe its updates *did* install successfully, but the downloaded package files were never cleaned up afterward (a separate, real Android/Fire OS bug pattern, distinct from #1).

**Disproven by direct measurement:** `adb shell df -h` on the first tablet showed `/cache` at 9.3MB used out of 516MB total — essentially empty. If gigabytes of uncleaned OTA packages were sitting there, this partition would show it. It doesn't.

---

## Confirmed via ADB (2026-09-23): what's actually true

Non-destructive diagnosis using `adb` (Android Debug Bridge) connected over USB — see "How to reconnect adb" below if doing this again.

```
$ adb shell df -h
Filesystem              Size  Used  Avail  Use%  Mounted on
/dev/block/dm-2         3.1G  2.8G   313M   91%  /          (real system partition)
/dev/block/mmcblk0p19   516M  9.3M   490M    2%  /cache
/dev/block/mmcblk0p21    24G   23G   1.1G   96%  /data      (this is the actual full partition)
```

Key finding: **the "System: 28GB" figure Fire OS's Settings app shows is not real.** The actual system partition (`/`) is only 3.1GB total. Fire OS's simplified Storage summary screen was never giving us a trustworthy number for that category — confirmed by it reading *identically* on two tablets with completely different update histories, and by it not moving at all after installing 11 updates. Don't trust that screen's "System" figure for this class of problem again; go straight to `adb shell df -h` for ground truth.

The partition that's actually full is `/data` (24GB total, 23GB used, 1.1GB free — 96%). Ruled out as contributors, by direct measurement:
- Shared/user-visible storage (`/storage/emulated/0`: Downloads, Pictures, Movies, etc.) — only ~6.5MB total across everything.
- `/cache` — 9.3MB used.
- Fully Kiosk Browser's own app data — ~38MB (matches its Android App Info screen).
- Any unexpected/rogue app — `pm list packages -3` (third-party apps) returned exactly one result: `de.ozerov.fully` (Fully Kiosk itself). Nothing else installed outside stock Fire OS.
- Manually scanning Settings → Apps with "Show system apps" enabled — nothing anomalously large stood out among the ~242 stock system apps.

That leaves the space genuinely consumed somewhere inside stock Fire OS system apps' own private data (`/data/data/<package>`, `/data/system`, `/data/misc`, etc.) — none of which the unprivileged `shell` user can read on a non-rooted device (`ls`/`du` all return `Permission denied`). Getting more specific than "it's inside stock Fire OS itself, not anything we installed or configured" would require rooting the device.

**Rooting a production kiosk tablet to chase this further is not recommended** — real risk (bricking, voided warranty, no vendor support) for a problem that already has a confirmed, safe fix.

---

## Resolution: factory reset

Since `/data` is confirmed genuinely, almost entirely full (not a UI artifact this time), a factory reset — which wipes `/data` back to empty — is guaranteed to reclaim the space, unlike the update-install attempt which never touched the real problem.

1. Do **one tablet first**. Confirm storage is actually reclaimed and everything works before touching the rest.
2. Factory reset via Settings → Device Options → Reset to Factory Defaults (or by holding the physical button combo if the tablet won't boot into Settings — check the specific Fire tablet model's reset procedure).
3. Re-provision after reset:
   - Reinstall Fully Kiosk Browser (wiped along with everything else).
   - Re-open the room's **Tablet Link** (workspace admin panel → Rooms → that room) to re-establish the tablet's `ws_{slug}` Spacebook session.
   - Re-apply Fully Kiosk's kiosk-lock / default-launcher settings so it locks back into the room display automatically.
4. Budget ~15–20 minutes per tablet for the reset plus re-provisioning.

### Prevention
No confirmed way to prevent recurrence, since the exact consuming component inside stock Fire OS was never identified (would need root to find it). Given it took roughly 9 months to reach crisis level on the first tablet, a reasonable insurance policy is a **periodic preventive reset** (e.g. annually) as part of routine tablet maintenance, rather than waiting for the next low-storage warning — treat it the same as the update-check cadence from the disproven hypotheses above: a recurring calendar task, not something Spacebook can detect or alert on, since it's entirely outside the app.

### How to reconnect adb, if diagnosing this again
1. On the tablet: Settings → Device Options → About → tap the build/serial number 7 times to unlock Developer Options.
2. Settings → Device Options → Developer Options → enable USB debugging.
3. Connect the tablet to a Mac with `adb` installed (`brew install android-platform-tools`).
4. Accept the "Allow USB debugging?" prompt **on the tablet screen** when it appears.
5. `adb devices` should show the device as `device` (not `unauthorized`) before running anything else.

---

## If you still want to clear Fully Kiosk's cache anyway

Not the fix for this issue (its cache is only ~18-38MB total, confirmed twice), but still reasonable, low-risk periodic hygiene for a kiosk tablet:

Android (and Fully Kiosk Browser's own settings) normally distinguish two genuinely different actions:
- **Clear Cache** — wipes only temporary/cached files. Cookies and login state live in a separate data store and should survive this.
- **Clear Data** / **Clear Storage** — wipes everything, cookies included. This *would* drop the tablet's `ws_{slug}` session cookie (see [tablet-snapshots-stale.md, Step 3](tablet-snapshots-stale.md) for what that looks like and how to recover from it).

Verify which one your Fully Kiosk Browser version actually does before relying on it: clear cache-only on one tablet, confirm it's still showing the room display with no re-login needed, before repeating elsewhere or scheduling it automatically.

---

## Related

- [ADR-011: tablet screenshot via html2canvas self-snapshot](../decisions/011-tablet-screenshot-approach.md) — confirms the snapshot feature doesn't write to local storage.
- [tablet-snapshots-stale.md](tablet-snapshots-stale.md) — what a lost `ws_` cookie looks like and how to recover a tablet's session.
