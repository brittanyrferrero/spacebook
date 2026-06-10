# ADR-006: Tablet auto-reload via version polling
Date: 2026-06-09
Status: Accepted

## Context

Tablets run the room display page (`/[workspace]/room/[roomId]`) as a permanently-open browser session. When a new Vercel deployment goes out, the tablet keeps running the old JavaScript bundle until someone manually refreshes it. This meant that every deploy — including bug fixes affecting the tablet — required a physical visit to every tablet to press refresh. For the walk-in booking bug (walkin@local failing email validation), tablets stayed broken until manually reloaded even after the fix was shipped.

The question: how should tablets pick up new deployments automatically?

### Options considered

**SSE / WebSocket push** — server pushes a "new version" event to all connected clients instantly. Clean UX, but requires a persistent connection with reconnect logic. Adds operational complexity for a display that sits idle most of the day.

**Service worker** — intercept fetch, detect stale bundle, reload. Requires a service worker implementation and careful cache invalidation strategy.

**Version polling** — add a lightweight endpoint returning the current deployment ID; the client polls it on an interval and reloads on change. Stateless, simple, no persistent connection. Delay of up to one polling interval before reload.

## Decision

Version polling. The delay (≤2 minutes) is acceptable for a kiosk display — tablets don't need instant updates. The implementation is ~15 lines and fits naturally into the existing `useEffect`/`setInterval` pattern the page already uses for the 60-second booking refresh.

A new public endpoint `/api/version` returns `VERCEL_GIT_COMMIT_SHA` (falling back to `VERCEL_DEPLOYMENT_ID`, then `'dev'` locally). The room display page captures the version string on mount and reloads if a subsequent poll returns a different value.

The endpoint is marked `force-dynamic` — without this, Next.js would statically bake the SHA in at build time and all polls would return the same string forever.

## Consequences

**Better:** Tablets self-update within 2 minutes of any deploy. No more manual refresh visits after shipping fixes.

**One-time cost:** Tablets needed a single manual refresh to load the code that contains the polling logic. After that initial refresh, all future deploys are automatic.

**Edge case:** If a tablet loads the page mid-rollout (first poll hits the new server), it captures the new SHA as its baseline and never reloads. Benign — the tablet already has the new code.

**Network:** One small HTTP request per tablet per 2 minutes. Negligible.

**Future maintainers:** The `/api/version` endpoint is in `PUBLIC_API_SEGMENTS` and must stay there — it needs to be reachable without a workspace session cookie. If you add new public API segments, also add them to `RESERVED_SLUGS` in `lib/workspace.ts` (see ADR for why: a workspace named after a public segment bypasses middleware auth for all its routes).
