# ADR-021: Switchable tablet design (Classic / Linen)
Date: 2026-09-29
Status: Accepted

## Context

The room tablets got a full redesign ("Linen": a large free/in-use ring, one-tap
walk-in durations, day/week/month calendar, Linen-styled booking pop-ups). It was
prototyped and tried on a real Fire tablet first. Rolling it out to every tablet at
once is risky: tablets are unattended kiosks, a layout or font problem only shows on
the physical device (see the Fraunces crossbar issue below), and nobody wants to
walk to every tablet to recover. The requirement was a rollout that can be undone
quickly, without a redeploy and without touching tablets.

### Options considered

**Vercel deployment rollback** — instant, but reverts every other change in that
deploy and is all-or-nothing across every workspace.

**Feature flag service (Vercel Flags / Edge Config)** — works, but is more
infrastructure than a handful of tablets per workspace needs, and adds a second
place settings live.

**Workspace setting + per-tablet URL override** — reuses the existing settings
store (same pattern as `accentColor`), gives admins a normal toggle, and lets one
tablet be piloted with `?design=linen`.

## Decision

Workspace setting `tabletDesign: 'classic' | 'linen'`, stored in KV at
`ws:{workspaceId}:cfg:tabletDesign`, **defaulting to Classic** so shipping the code
changes nothing until an admin opts in. Validation lives in `lib/tablet-design.ts`.

- `app/[workspace]/room/[roomId]/page.tsx` only chooses: `?design=` override if
  valid, else the workspace setting, else Classic. Each design is a lazily loaded
  chunk, so a tablet downloads only the one it shows.
- **Classic is frozen.** The old page body moved verbatim into
  `components/tablet/ClassicRoomDisplay.tsx`. Linen does not share code with it
  (it has its own copies of small helpers under `components/tablet/linen/`) so that
  switching back always gives exactly what ran before. The duplication is
  intentional and temporary.
- **Tablets follow the setting without a refresh.** The page re-checks every
  2 minutes via `GET /settings?only=tabletDesign` — one cached workspace lookup and
  one KV read. The full settings payload was rejected for polling: six KV reads,
  plus two `count(*)` queries on trial workspaces, per tablet per check.
- **A failed check never flips a running tablet.** On error the current design is
  kept; only a first load with no answer falls back to the override or Classic.
  (Same lesson as ADR-019: a transient read failure must not be treated as a
  real change.)
- Linen uses the same endpoints and background jobs as Classic: 60 s booking
  refresh, reload on deploy (ADR-006), 2-minute idle reset, palantir snapshots
  (ADR-011), and the same walk-in / schedule / edit / cancel API calls.

### Deliberate differences in Linen

- **Status uses the exact time.** The on-screen clock re-renders once a minute, but
  status, ring and walk-in durations read `new Date()` at render. Using the
  minute-stale clock made a just-booked walk-in look like it started in the future
  ("Free for 1 minute").
- **"Free until" only looks at today.** A booking tomorrow morning is never "next".
- **Other free rooms are information, not links.** Classic linked them, which
  navigated the kiosk away from its own room.
- **Fraunces' optical size is pinned** (`font-variation-settings: 'opsz' 24`) on
  the big status word. At display sizes Fraunces switches to hairline strokes and
  the crossbar of the "e" disappears on the Fire tablets' screens ("Free" read as
  "Frcc" on the real device).
- **The workspace accent colour is not used**; Linen has its own palette.
- **Finish early is not included** until its permissions question is settled
  (ADR-020).

## Consequences

- Switching back is a click in admin → Settings → Tablet design; every tablet in
  the workspace follows within ~2 minutes. Tablets that are asleep or offline catch
  up on their next check.
- When Linen has been the default for a while, delete `ClassicRoomDisplay.tsx`, the
  setting and the override in one PR, and fold the helpers back together.
- The pre-workspace route `app/room/[roomId]` is untouched; tablets are provisioned
  through `/{workspace}/room/{id}` (via `/api/[workspace]/t` and `tablet-enter`).
