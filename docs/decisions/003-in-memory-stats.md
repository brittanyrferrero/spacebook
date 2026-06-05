# ADR-003: In-memory stats calculation
Date: 2026-06-05
Status: Accepted

## Context

The Overview tab in the admin panel computes analytics: total bookings, hours booked, utilisation %, space pressure, busiest hours, heatmaps, and booking origin breakdowns. These require aggregating booking data across a date range.

The two natural approaches were:

1. **SQL aggregations.** Write aggregate queries in Supabase (GROUP BY, COUNT, SUM, window functions) that return pre-computed totals to the API.
2. **Load and process in JS.** Fetch all bookings for the date range from Supabase into the API server, then compute everything in JavaScript.

## Decision

All stats are computed by the `getAdminStats` function in `lib/mock/api.ts`. The production stats endpoint (`/api/[workspace]/admin/stats`) fetches rooms, bookings, and config from Supabase and Redis, assembles them into a store object that matches the mock store interface, and passes it to `getAdminStats`. The same function runs in both mock mode and production.

This means all aggregation logic lives in JavaScript, not in SQL.

## Consequences

**Why this was the right call at the time:**

The `getAdminStats` function powers the mock/demo mode. It had to run in JavaScript (there's no database in mock mode). Re-implementing the same logic in SQL for production — with all the complexity of conditional aggregations, timezone handling, and the space-pressure concurrent-occupancy calculation — would mean maintaining two implementations of the same business logic. The JS version is the only version, and production reuses it.

The booking volumes for a room booking tool at a single office are small. Even for an active workspace with 5,000 bookings in a 90-day range, the Supabase query returns well under 1 MB of data and the in-memory computation takes under 10ms. At those volumes, SQL aggregation would not be meaningfully faster.

**The tradeoffs:**

The stats endpoint loads *all* bookings for the date range into memory on the Vercel serverless function. The maximum selectable range in the UI is currently unconstrained — if someone requests a 2-year range on a workspace with 20,000 bookings, the payload will be larger. Vercel functions have a 1 GB memory limit; this won't OOM, but it will be slow.

The bigger risk is the Supabase query cost, not the JS computation. Supabase has query row/response limits on the free and small tiers. A workspace with very high booking volumes could hit those limits.

**When to revisit:**

This decision should be revisited if:
- A workspace reaches ~10,000 bookings and the stats endpoint becomes slow (>2s response time is a signal)
- The date range selector is extended to allow multi-year ranges
- Named paid tiers are introduced and high-volume workspaces need SLA guarantees

The fix at that point is: move the heavy aggregations (total counts, heatmap buckets) to SQL GROUP BY queries, and keep only the complex logic (space pressure, timezone-adjusted hours) in JS. The `getAdminStats` function is well-factored enough that this refactor is localised.

**The mock/production parity argument:**

Keeping one JS implementation means the demo mode and production mode show identical stat calculation behaviour. A discrepancy in how utilisation % is computed between demo and production would be a trust problem. One function, tested once, with no risk of divergence, is worth the scalability trade-off at current volumes.
