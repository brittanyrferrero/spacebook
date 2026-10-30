# Runbook: Tablet offline / unplugged alerts

## What this covers

A workspace super admin received a "tablet is offline" or "tablet is unplugged" email
from spacebook, or expected one and didn't get it. See
[ADR-024](../decisions/024-tablet-offline-alerts.md) for how the alerts work.

**How it works in one paragraph:** Linen tablets send a heartbeat every 2 minutes
(battery, charging, page start time) and a goodbye beacon when the screen goes off or
the page closes. Classic tablets are only seen through their 5-minute screenshot
uploads. Every 15 minutes, a GitHub Actions job calls `/api/tablet-health`, which
emails super admins about any tablet that has been silent for 15+ minutes, or has been
on battery for 5+ minutes, and sends an all-clear when it recovers.

Tablets are meant to be **always plugged in with the screen always on**, showing
spacebook in Fully Kiosk Browser. Any alert means that's no longer true.

---

## "Tablet is unplugged"

The tablet is still working but running on battery. Plug it back in before it dies.

- Check the cable is seated at both ends and the socket has power. A loose USB cable on
  a wall mount is the usual culprit.
- If it's plugged in and still reported as unplugged, the charger or cable may be
  faulty, or too weak to keep up with an always-on screen. Swap it.
- You'll get a "plugged back in" email when it's charging again. If the battery runs
  out first, you'll get an offline alert instead.

---

## "Tablet is offline": work from the "likely cause" line

| Email says | What to check |
|---|---|
| **ran out of power… unplugged** | Plug it in, wait for it to boot, check spacebook opens. Then find out why it was unplugged. |
| **screen turned off or spacebook was moved off-screen** | Someone pressed the power button, or opened another app or the home screen. Wake it and bring spacebook back to the front. If it keeps happening, check Fully Kiosk's kiosk mode / app lock is on. |
| **page was closed, or the browser navigated away** | Reopen the room's tablet link from the admin panel → Rooms → **Tablet URL**. |
| **lost contact suddenly… It was plugged in** | Most likely wifi or a crash. Check the tablet is on, connected to wifi, and showing spacebook; restart Fully if it's frozen. |
| **lost contact suddenly… running on battery** | Probably unplugged and died before the next check could warn you. Treat as a flat battery. |
| **Classic design, which reports less detail** | Could be any of the above; go and look at it. Moving the workspace to Linen gets better alerts. |

**Tablet shows a sign-in / "enter workspace" page:** its session cookie was lost (storage
cleared, workspace URL renamed, browser reset). Open the room's **Tablet URL** from the
admin panel on the tablet. See [tablet-snapshots-stale](tablet-snapshots-stale.md),
Step 3.

The "back online" email adds what the tablet reported after returning: "the page
restarted" means it was rebooted or the browser reopened; "lost its network connection
for about N minutes" means wifi.

---

## Expected an alert but didn't get one

1. **Is the recipient a super admin?** Only `super_admin` roles are emailed (admin
   panel → Members). A workspace with no super admin gets nothing; Vercel logs show
   `[tablet health] no super admin to notify`.
2. **Is the check running?** GitHub → Actions → **Tablet health check**. Runs should
   appear every ~15 minutes and be green.
   - **401 / failing runs:** the `CRON_SECRET` repo secret is missing or doesn't match
     `CRON_SECRET` in Vercel production. Fix the secret (Settings → Secrets and
     variables → Actions).
   - **No runs at all:** GitHub disables scheduled workflows after 60 days with no repo
     activity. Re-enable it from the Actions tab. The daily Vercel cron (13:00 UTC)
     still runs in the meantime.
   - You can trigger a run by hand with **Run workflow** (or `gh workflow run tablet-health.yml`).
     The response body shows `{ checked, wentOffline, cameBack, unplugged, pluggedIn }`.
3. **Has the tablet ever reported in?** Rooms whose tablet has never sent a heartbeat
   or snapshot (or has been silent 30+ days) are skipped. In the Upstash console:
   ```
   HGETALL tablet:seen:{workspaceId}:{roomId}
   ```
   Empty means spacebook doesn't know this room has a tablet.
4. **Is the room disabled?** Disabled rooms are skipped.
5. **Was an alert already sent?** Each incident alerts once. Check
   `GET tablet:alert:{workspaceId}:{roomId}` / `GET tablet:unplugged:{workspaceId}:{roomId}`.
   If one is set, the email went out when it was set; check the super admin's spam folder
   and the Resend dashboard.
6. **Unplugged warnings specifically:** they need the tablet to report its battery. In
   `HGETALL tablet:seen:…`, look for `battery` and `charging`. If they're missing:
   - Classic tablets never report battery. Switch the workspace to Linen.
   - On Fully Kiosk Browser, turn on **Settings → Advanced Web Settings → Enable
     JavaScript Interface**, so spacebook can read the battery if the standard Battery
     API isn't available.

---

## Getting too many alerts

- **Repeated offline/online pairs for one tablet:** it's dropping off wifi or crashing.
  Look at the recovery notes: frequent "network connection" notes point to wifi, and
  frequent "page restarted" notes point to the tablet or Fully restarting.
- **Alerts for a tablet that's been removed:** disable or delete the room, or wait. A
  tablet that never reports again is forgotten after 30 days, and alerts once at most.
- **A workspace that switches tablets off at night:** there are no quiet hours by
  design (ADR-024). If that changes, the place to add them is `/api/tablet-health`,
  e.g. skipping checks outside the workspace's display hours.
