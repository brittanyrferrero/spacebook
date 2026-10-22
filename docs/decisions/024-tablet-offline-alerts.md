# ADR-024: Tablet offline and unplugged alerts via heartbeat + scheduled check
Date: 2026-10-22
Status: Accepted

## Context

Room tablets are unattended kiosks. When one is switched off, loses wifi, runs out of
battery or has its browser closed, nobody finds out until someone notices a blank
screen. Workspace super admins wanted an email when that happens, with as much detail
about the likely cause as possible.

Tablets are set up to be always plugged in with the screen never sleeping, so *any*
shutdown is worth flagging: it means the tablet is dead or the screen probably isn't
showing spacebook any more. For the same reason, running on battery or the screen
turning off are reported as problems, not normal states. Being unplugged is also the
one failure we can see *coming*, hours before the battery dies.

A browser can't reliably announce "I'm turning off", so the only robust signal for
shutdowns is silence: the tablet stops reporting in, and something on the server notices.

### Options considered

**Push from the tablet on shutdown** (`beforeunload`/`pagehide` only): rejected as the
primary signal. Power loss, crashes, dead batteries and wifi drops give the page no
chance to say anything. Kept as a *supplementary* goodbye beacon for the cases where it
does fire, because it improves the "likely cause" text.

**Reuse the 5-minute snapshot upload as the heartbeat**: works for liveness (and is
what Classic tablets use), but html2canvas failures would look like outages, and it
carries no device details. A separate lightweight heartbeat is cheap.

**Fully Kiosk Browser's own cloud monitoring**: would work for Fully devices, but it's
a separate paid service, separate accounts per workspace, and doesn't email *workspace*
super admins. Rejected in favour of something every spacebook tablet gets for free.

**Vercel Cron alone**: the plan only allows daily jobs, too slow for a broken kiosk.
Kept as a fallback; GitHub Actions provides the 15-minute schedule (see below).

## Decision

**Liveness record.** Every tablet write refreshes a Redis hash
`tablet:seen:{workspaceId}:{roomId}` (`lastSeen` plus details, 30-day TTL):

- **Linen** tablets send `POST /api/[workspace]/tablet-heartbeat` every 2 minutes with
  battery level, charging state and page start time. They also send a
  `navigator.sendBeacon` goodbye when the page is hidden (screen off, app switched) or
  closed, and report how long the network was down after an `offline`→`online` gap.
  Battery comes from the standard Battery API, falling back to Fully Kiosk Browser's
  JavaScript interface (`fully.getBatteryLevel()` / `fully.isPlugged()`), which needs
  "Enable JavaScript Interface" turned on in Fully's settings. If neither is
  available, everything works except the unplugged warning and battery details.
- The first heartbeat reporting `charging: false` sets `unpluggedSince` (HSETNX); a
  heartbeat reporting `charging: true` clears it.
- **Classic** tablets are frozen (ADR-021), so they get no heartbeat; instead the
  existing snapshot upload (ADR-011) refreshes `lastSeen`. Their offline alerts are
  less specific and they never get unplugged warnings.

**Scheduled check.** `GET /api/tablet-health` loads every active room that has ever had
a tablet report in and emails that workspace's **super admins**:

| Alert | Fires when | All-clear |
|---|---|---|
| Offline | no word for 15+ minutes | "back online" when it reports in again |
| Unplugged | still reporting, but on battery for 5+ minutes | "plugged back in" when charging resumes |

Each alert fires once per incident (state in `tablet:alert:*` and `tablet:unplugged:*`).
If an unplugged tablet dies and later comes back charging, only the "back online" email
is sent. The 5-minute grace stops someone briefly moving a tablet between sockets from
triggering a warning.

The likely cause of an outage is inferred from the last things the tablet said
(`likelyCause` in `lib/tablet-health.ts`): page closed → flat battery after being
unplugged → screen turned off / app switched → abrupt silence (wifi/power/crash).
Recovery emails add hindsight: a new page start means the tablet was rebooted or the
browser reopened; a reported network gap means wifi.

**Schedule.** `vercel.json` runs the check daily as a fallback and a GitHub Actions
schedule (`.github/workflows/tablet-health.yml`, every 15 minutes, free because the
repo is public) is the real trigger. Both authenticate with `CRON_SECRET`.

## Consequences

- An offline alert means "stopped reporting", not a confirmed cause. A lost `ws_`
  cookie (tablet stuck on a sign-in page) looks the same as being switched off; the
  email points admins at the tablet link in the admin panel for that case.
- Worst-case detection time is about 30 minutes (15-minute threshold + 15-minute
  schedule), longer if GitHub delays the scheduled run. GitHub also disables schedules
  on repos with no activity for 60 days. The daily Vercel cron still runs either way.
- There are no quiet hours: tablets are meant to be on 24/7, so an overnight shutdown
  is alerted like any other. Revisit if a workspace starts switching tablets off at night.
- Workspaces with no super admin get no alerts (logged as a warning).
- Heartbeats are trusted on the same basis as everything else in a workspace: a `ws_`
  cookie is required, and per ADR-001 knowing the slug is the credential. So a workspace
  member could fake a heartbeat and mask an outage in their *own* workspace (snapshots
  have the same property). Cross-workspace spoofing isn't possible because the cron only
  reads keys under each room's real workspace ID.
- Heartbeat and snapshot writes check that `roomId` is a real room in that workspace
  before touching Redis, so made-up room IDs can't mint unlimited keys (snapshots are
  ~800KB each). Heartbeats are also rate limited (20/min per IP).
- `/api/tablet-health` **fails closed**: if `CRON_SECRET` isn't set (as on preview
  deployments, which share production data) it rejects every call, rather than running
  for anyone the way `gcal-renew` does.
- `tablet-health` is in `PUBLIC_API_SEGMENTS` and `RESERVED_SLUGS`, like `gcal-renew`.

See also: [tablet-offline-alert runbook](../runbooks/tablet-offline-alert.md).
