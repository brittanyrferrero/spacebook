# Runbook: Tablet storage is full

**Symptom:** A tablet running the room display page shows an OS-level "Device storage is low" prompt (Fire OS's own "Turn on Auto Archive" / "Free Up Space" dialog, not anything from Spacebook). Checking Storage in Settings shows the device close to 100% full, with almost nothing attributable to Photos, Music, Games, or "Other apps" — the bulk sits in "System." "Free Up Space" typically finds only a few MB reclaimable (e.g. a leftover Fully Kiosk Browser `.apk` installer in Downloads), nowhere near enough to explain the gap.

If this is happening across every tablet at once, and the only things installed are Fully Kiosk Browser and Spacebook, this is not independent hardware aging — it's a real, systemic effect of how the two interact over a long uptime. Confirmed 2026-09-22 across all tablets in one workspace.

---

## Root cause: not Spacebook's own storage use, but the kiosk browser's cache of it

Ruled out first, and worth ruling out again if this resurfaces: Spacebook itself writes almost nothing to browser storage.
- The tablet-snapshot feature ([ADR-011](../decisions/011-tablet-screenshot-approach.md)) renders in-memory via html2canvas and POSTs the JPEG straight to the server — it never touches the tablet's local filesystem.
- Every `localStorage` key the app uses (`spacebook_user`, `sb_error_report`) holds a single small value that gets overwritten in place on every write, never appended to or accumulated.
- There's no service worker, no PWA manifest, no Cache API usage, and no custom `Cache-Control` headers in `next.config.js` — nothing configured to cache aggressively on purpose.

The actual mechanism is Next.js's **default** behavior for its own build output, combined with how a kiosk tablet is operated:

- Every JS/CSS bundle under `/_next/static/` is served with `Cache-Control: public, max-age=31536000, immutable` by default. Every deploy produces a brand-new set of content-hashed filenames — by design, none of them are ever meant to be revisited or invalidated, since a hashed filename can never point at different content.
- A normal visitor's browser evicts old cache entries over time as part of routine use across many sites. A kiosk tablet running Fully Kiosk Browser essentially never closes and is rarely, if ever, manually cleared — so it just keeps every version of every bundle from every deploy, indefinitely.
- Spacebook ships frequently. Each deploy leaves another full set of cached bundles behind, permanently, on every tablet that loaded the app since. On a small-capacity tablet (25GB class devices are common for this kind of kiosk display), this adds up to filling the device over months of active use.

This explains the "all tablets, same time, only two apps installed" pattern exactly: they're all running the identical setup, for a similar stretch of uptime, against the same frequently-redeploying app.

---

## Fix

### Step 1 — Verify cache-only clearing is actually safe, on one tablet first

Android (and Fully Kiosk Browser's own settings) normally distinguish two genuinely different actions:
- **Clear Cache** — wipes only temporary/cached files. Cookies and login state live in a separate data store and should survive this.
- **Clear Data** / **Clear Storage** — wipes everything, cookies included. This *would* drop the tablet's `ws_{slug}` session cookie (see [tablet-snapshots-stale.md, Step 3](tablet-snapshots-stale.md) for what that looks like and how to recover from it).

Don't assume which behavior your installed Fully Kiosk Browser version actually has — verify empirically before touching every tablet:

1. Pick one tablet that's currently displaying normally.
2. Clear **only** its cache — either via Fully Kiosk Browser's own settings (look for a "Clear Cache" option distinct from "Clear Cookies"), or Fire OS's Settings → Apps → Fully Kiosk Browser → Storage → **Clear Cache** (not "Clear Data"/"Clear Storage").
3. Check the tablet immediately after. If it's still showing the room display normally with no re-login/re-link needed, cache-only clearing is confirmed safe on this device/version.

If step 3 shows the tablet lost its session instead, treat this as a "Clear Data" action in disguise — fall back to the manual, occasional-recovery approach below rather than automating it.

### Step 2a — If cache-only clearing is confirmed safe

Set it up to run periodically and stop thinking about it. Fully Kiosk Browser has a setting for scheduled/automatic cache clearing (usually under its "Other Settings" or maintenance options). Enable it across all tablets. This should never require re-entering a tablet's link.

### Step 2b — If clearing cache also drops the cookie on your setup

Don't schedule it automatically — that would silently log every tablet out on a schedule nobody's watching, trading a storage problem for an availability problem. Instead:
- Clear cache manually, tablet by tablet, whenever storage gets flagged (or on a calendar reminder well before it gets critical).
- After clearing, re-open each affected room's "Tablet link" (workspace admin panel → Rooms → the room's tablet link) to restore its session — same recovery path as any other `ws_` cookie loss.

---

## Related

- [ADR-011: tablet screenshot via html2canvas self-snapshot](../decisions/011-tablet-screenshot-approach.md) — confirms the snapshot feature doesn't write to local storage.
- [tablet-snapshots-stale.md](tablet-snapshots-stale.md) — what a lost `ws_` cookie looks like and how to recover a tablet's session.
