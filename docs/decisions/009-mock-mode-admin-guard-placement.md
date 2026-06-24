# ADR-009: Admin guard placement relative to MOCK_MODE early returns
Date: 2026-06-18
Status: Accepted

## Context

Spacebook has two deployed environments that share a single codebase:

- **Production** — real Supabase + Redis, real admin cookies
- **Demo** — `MOCK_MODE=true`, in-memory data, no Supabase, no Redis

The demo admin panel is accessible via `/demo-admin`, which redirects to `/demo/admin`. This path sets a workspace session cookie (`ws_demo`) but **never sets an `admin_demo` cookie** — it bypasses the normal admin password flow entirely because demo workspaces don't have passwords.

In June 2026, a security audit (issues #123 and #124) found that several admin-only GET routes had no auth guard at all. Adding guards was correct. But in the first implementation, guards were placed at the top of the handler — before the `MOCK_MODE` branch. This immediately broke the demo admin panel: every request returned 403 because the `admin_demo` cookie didn't exist.

The fix was to move guards to after the `MOCK_MODE` early return. This triggered a clarifying question: is this safe? Could demo mode be abused to bypass auth in production?

The answer is no. `process.env.MOCK_MODE === 'true'` is an env var set at deploy time. In production it is absent (or `'false'`). No user request can change it. The MOCK_MODE branch only runs in the demo deployment where the security model is intentionally different.

## Decision

**Admin cookie checks on READ (GET) routes must be placed _after_ any `MOCK_MODE` early return.**

```ts
// ✅ Correct — demo panel works; production still guarded
export async function GET(req: NextRequest, { params }) {
  if (process.env.MOCK_MODE === 'true') {
    return Response.json(getMockData())
  }
  const adminRole = req.cookies.get(`admin_${params.workspace}`)?.value
  if (!adminRole) return Response.json({ error: 'Admin required.' }, { status: 403 })
  // production logic ...
}
```

**Scope of this rule:** READ routes (GET) that are newly gaining an admin guard. Write routes (POST, PATCH, DELETE) that had admin guards before this ADR may have them before the MOCK_MODE branch — those were written before the demo admin panel existed and the demo doesn't exercise admin write flows. Don't move them without testing.

**MOCK_MODE early returns in write routes** should be added when the production path calls Supabase or Redis (service role key / upstash not configured in mock deployments). Add the early return before the DB call, after the admin guard.

## Consequences

**Better:** Demo admin panel continues to work without any special-casing in the mock data layer.

**Better:** Production routes are correctly guarded — the MOCK_MODE branch never executes in production.

**Risk to watch:** Any future route that adds a MOCK_MODE branch to an existing route that already has an admin guard above it. Visually the guard appears correctly placed, but if MOCK_MODE is inserted above it, the guard is now below both the mock check and the guard. Read the order carefully: MOCK_MODE first, then guard, then production DB calls.

**Footgun:** Because MOCK_MODE returns before the guard, a code reader might think "there's no auth on this mock path." That's intentional. The demo is not a secure environment — it has no real data. The auth model for the demo is "anyone who can reach `/demo-admin` gets the demo admin experience."

**Invariant for future maintainers:** When adding a new admin-only GET route, the template is:

```ts
if (MOCK_MODE) { return mockData }
if (!adminCookie) { return 403 }
// production
```

Never swap the first two lines on a GET route.
