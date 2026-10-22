# ADR-024: Tablet-offline alerts via heartbeat + scheduled check
Date: 2026-10-22
Status: Accepted

## Context

Room tablets are unattended kiosks. When one is switched off, loses wifi, runs out of
battery or has its browser closed, nobody finds out until someone notices a blank
screen. Workspace super admins wanted an email when that happens, with as much detail
about the likely cause as possible.

A browser can't reliably announce "I'm turning off", so the only robust signal is
silence: the tablet stops reporting in, and something on the server notices.

## Decision

**Liveness record.** Every tablet write refreshes a Redis hash
`tablet:seen:{workspaceId}:{roomId}` (`lastSeen` + details, 30-day TTL):

- **Linen** tablets send `POST /api/[workspace]/tablet-heartbeat` every 2 minutes with
  battery level, charging state and page start time. They also send a
  `navigator.sendBeacon` goodbye when the page is hidden (screen off, app switched) or
  closed, and report how long the network was down after an `offline`→`online` gap.
- **Classic** tablets are frozen (ADR-021), so they get no heartbeat; instead the
  existing snapshot upload (ADR-011) refreshes `lastSeen`. Alerts for them are less
  specific.

**Scheduled check.** `GET /api/tablet-health` loads every active room, flags any whose
tablet has been silent for 15+ minutes, and emails that workspace's **super admins**
once per outage (state in `tablet:alert:{workspaceId}:{roomId}`), plus a "back online"
email when it reports in again. Rooms that have never had a tablet report in are skipped.

The likely cause is inferred from the last things the tablet said (`likelyCause` in
`lib/tablet-health.ts`): page closed → screen hidden → low battery not charging → abrupt
silence (wifi/power/crash). Recovery emails add hindsight: a new page start means the
tablet was rebooted or the browser reopened; a reported network gap means wifi.

**Schedule.** Vercel Cron on the current plan only allows daily jobs, so `vercel.json`
runs the check daily as a fallback and a GitHub Actions schedule
(`.github/workflows/tablet-health.yml`, every 15 minutes, free because the repo is
public) is the real trigger. Both authenticate with `CRON_SECRET`.

## Consequences

- An alert means "stopped reporting", not a confirmed cause. A lost `ws_` cookie
  (tablet stuck on a sign-in page) looks the same as being switched off; the email
  points admins at the tablet link in the admin panel for that case.
- Tablets switched off every night will produce an offline + back-online email pair
  each day. If that turns out noisy, add quiet hours (e.g. outside the workspace's
  `displayHours`) to the check.
- GitHub may delay scheduled workflows by several minutes, and disables schedules on
  repos with no activity for 60 days. The daily Vercel cron still runs either way.
- `tablet-health` is in `PUBLIC_API_SEGMENTS` and `RESERVED_SLUGS`, like `gcal-renew`.
