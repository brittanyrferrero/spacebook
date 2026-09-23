# Runbook: Tablet storage is full

**Symptom:** A tablet running the room display page shows an OS-level "Device storage is low" prompt (Fire OS's own "Turn on Auto Archive" / "Free Up Space" dialog, not anything from Spacebook). Checking Storage in Settings shows the device close to 100% full, with almost nothing attributable to Photos, Music, Games, or "Other apps" — the bulk sits in "System." "Free Up Space" typically finds only a few MB reclaimable, nowhere near enough to explain the gap.

Confirmed 2026-09-22, happening across every tablet in one workspace at once — the only things installed on any of them are Fully Kiosk Browser and Spacebook.

**Status as of 2026-09-23: root cause confirmed.** Fire OS's own Settings → Storage screen is unreliable for this class of problem — its "System" figure is not a real, live measurement (see "Fire OS's Settings screen lied to us" below) and sent this investigation down two dead ends before a proper tool was used. **The real cause: the stock `Download Manager` system component's cache had accumulated ~19GB**, almost certainly from Fire OS system-update downloads never cleaned up over time. Fix: clear that one app's cache — see "Resolution" below. No factory reset needed.

---

## Fire OS's Settings screen lied to us — don't trust it for this

Before finding the real cause, two plausible-sounding hypotheses were tested directly against Fire OS's own Settings → Storage screen and disproven:

**Hypothesis: stuck Fire OS updates queued forever on an always-on kiosk tablet.** Real and worth knowing on its own terms — Fire OS only auto-installs queued updates during an idle/charging window, and a kiosk tablet configured to always display the room booking screen never goes idle, so updates can download but never auto-install. Found 11 such updates queued since December 2025 on one tablet. **But disproven as the explanation for this storage crisis**: installed all 11 manually, and the Settings screen's "System" figure barely moved (~28GB → ~27GB, noise). Whatever was actually consuming the space, it wasn't *these* queued-but-uninstalled updates.

**Hypothesis: orphaned update packages left behind after a past successful install.** A second tablet showed the identical symptom with zero pending updates, suggesting maybe an update had applied but not cleaned up its download. Disproven by direct measurement: `adb shell df -h` showed `/cache` at only 9.3MB used out of 516MB — essentially empty.

**The real problem underneath both dead ends:** Settings' "System" figure was never trustworthy. It read *identically* (~28GB) on two tablets with completely different update histories, and it's larger than the device's entire storage capacity (25.62GB) — a category cannot really consume more space than the whole disk has. This should have been the tip-off earlier: that number is not a live "currently occupied" measurement, and no amount of theorizing from it was ever going to converge on the truth.

---

## How the real cause was actually found

Non-destructive diagnosis, escalating through what's available at each tier — worth doing in this order next time rather than re-deriving it:

### Tier 1 — adb, no root: confirms the problem is real, but can't name the culprit
```
$ adb shell df -h
/dev/block/dm-2         3.1G  2.8G   313M   91%  /          (the real system partition — nowhere near 28GB)
/dev/block/mmcblk0p19   516M  9.3M   490M    2%  /cache
/dev/block/mmcblk0p21    24G   23G   1.1G   96%  /data      (this is the partition that's actually full)
```
This confirms `/data` is genuinely ~96% full — not a UI artifact — and rules out shared storage (`/storage/emulated/0`: ~6.5MB total), Fully Kiosk's own data (~38MB via its Android App Info screen), and any rogue third-party app (`adb shell pm list packages -3` returned exactly one: `de.ozerov.fully`, Fully Kiosk itself).

What it **can't** do: see inside individual apps' private data. `adb shell ls /data`, `/data/data`, `/data/system`, `/data/misc` etc. all return `Permission denied` for the unprivileged `shell` user on a non-rooted production build — this is deliberate Android sandboxing, not a dead end specific to this device. `adb root` was tried and correctly refused ("adbd cannot run as root in production builds"). Per-app storage accounting is gated behind the `StorageStatsManager` API, which requires an actual app holding the `PACKAGE_USAGE_STATS` permission — not reachable via plain shell commands (`dumpsys storagestats` exists as a service but returns an empty text dump; `dumpsys storaged` gives I/O activity over time, not static size; `dumpsys package --checkin` doesn't carry size fields on this Android version).

**Do not try to root the device to get past this.** Real risk (bricking, voided warranty) for a problem that Tier 2 solves safely.

### Tier 2 — a real storage-stats app: gets the actual answer

Install a legitimate storage analyzer app that uses the proper `StorageStatsManager` API path (the same one Fire OS's own Settings screen is supposed to use, just apparently miscategorizing). This requires sideloading since these tablets are intentionally not signed into an Amazon account:

1. On the tablet's browser, go to **f-droid.org** (verify the exact official domain) and download F-Droid's APK directly — no account needed, ever. Allow "install unknown apps" for that browser if prompted.
2. **Avoid APKPure or similar third-party APK mirror sites for this** — APKPure specifically has a documented history of its own installer bundling a malicious dropper in a past update. Not worth the risk on a production kiosk device you're otherwise deliberately keeping minimal.
3. Open F-Droid, let its repo index sync (can take a minute on first launch — if the app looks empty, give it time before assuming something's wrong), search for **DiskUsage**, install it.
4. Open DiskUsage. Grant it "Usage access" when it asks (Settings → Special app access → Usage access → enable for DiskUsage) — this is the permission that unlocks real per-app size data.
5. It renders a real, accurate breakdown. This is what actually cracked the case: **"Apps: 22.7 GiB"** (not the ~2.7GB Fire OS's Settings screen claimed), and drilling in, **"Download Manager" → its own cache: 19.2 GiB.**

---

## Confirmed root cause: Download Manager's cache, not "System"

Android's system-update mechanism uses the shared `Download Manager` component to stage OTA downloads. Its cache had accumulated ~19GB — almost certainly leftover downloaded update packages from *past* update activity (not the 11 freshly-queued ones from the disproven hypothesis above, which is why installing those didn't help — different, older accumulation, never cleaned up after being applied).

This also explains the earlier dead ends precisely: Fire OS's Settings screen was never surfacing this cache under a category that added up correctly — it's part of why "System" read as a meaningless, oversized, static-looking number instead of tracking real usage.

---

## Resolution (no factory reset needed)

1. Settings → Apps & Notifications → enable **"Show system apps"** → find **Download Manager**.
2. Tap it → **Storage** → **Clear Cache** (not "Clear Data" — not that it matters much for this specific package, since it has nothing to do with Fully Kiosk or Spacebook's session state, but it's the correct, minimal action regardless).
3. **This can take real time to visibly complete for a cache this large** — one tablet's number ticked down gradually rather than dropping instantly. Don't assume "Clear Cache" failed just because the number hasn't moved within the first few seconds; wait, then recheck. If it's still completely unchanged after a few minutes: back out of the screen entirely and back in (Settings sometimes doesn't auto-refresh the displayed figure), then try Force Stop → Clear Cache again, then as a last resort a reboot.
4. Recheck the overall Storage screen once it settles — expect the large majority of that ~19GB back.

### Prevention

**Why there's no fully automatic fix:** Spacebook is a web page running inside Fully Kiosk's browser. Browser JavaScript can only ever see its own site's storage usage (`navigator.storage.estimate()`) — it has no access to device-wide, cross-app storage information by design (the same sandboxing that stops one website from seeing another's data also stops it from seeing the OS's storage state). There is no code Spacebook could ship that would detect this, on this tablet or any other web-displayed kiosk. This is a real platform boundary, not a gap left unaddressed.

**What actually changes going forward, though, is the size of the manual task** — and it's now a fundamentally different, much smaller thing than what this runbook originally suggested (a blind, unexplained "reset every few months"):

- **Recurring check (recommended): quarterly, ~1 minute per tablet.** Settings → Apps → Download Manager → Storage — look at the cache figure. Nothing to interpret, no investigation, no ambiguity: if it's large (multiple GB), clear it there and then. It took roughly 9 months to reach crisis level the first time, so quarterly leaves real margin. Put this on a recurring calendar reminder alongside whatever other tablet maintenance already happens, rather than relying on memory.
- **If even that's more manual overhead than you want**, the category of tool that removes it entirely is a proper mobile device management (MDM) solution for the tablet fleet (e.g. Amazon's own Fire-for-Business device management, or a general Android MDM) — these typically support proactive storage alerts and remote scripted maintenance across a whole fleet without physically touching each device. That's a real infrastructure decision (cost, setup time) independent of anything in this codebase, worth considering only if the fleet grows or quarterly manual checks become a genuine burden — not a step to take reflexively right now.

### If this exact fix doesn't fully resolve it
Re-run the Tier 2 diagnosis (DiskUsage is now already installed) and see what's actually large this time — don't assume it must be the same cache regenerating; re-check rather than re-guess.

---

## How to reconnect adb, if diagnosing a tablet again
1. On the tablet: Settings → Device Options → About → tap the build/serial number 7 times to unlock Developer Options.
2. Settings → Device Options → Developer Options → enable USB debugging.
3. Connect the tablet to a Mac with `adb` installed (`brew install android-platform-tools`).
4. Accept the "Allow USB debugging?" prompt **on the tablet screen** when it appears.
5. `adb devices` should show the device as `device` (not `unauthorized`) before running anything else.

---

## Related

- [ADR-011: tablet screenshot via html2canvas self-snapshot](../decisions/011-tablet-screenshot-approach.md) — confirms the snapshot feature doesn't write to local storage.
- [tablet-snapshots-stale.md](tablet-snapshots-stale.md) — what a lost `ws_` cookie looks like and how to recover a tablet's session.
