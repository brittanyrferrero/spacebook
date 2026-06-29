# ADR-012: Palantir session bypass in middleware
Date: 2026-06-29
Status: Accepted

## Context

Workspace routes (`/{workspace}/...` and `/api/{workspace}/...`) require a `ws_{slug}` or `admin_{slug}` cookie — the middleware redirects to `/enter/{workspace}` if neither is present. The palantir overlord view needed to load content from these workspace-scoped routes (initially iframe thumbnails, then tablet-snapshot API calls) without the palantir admin having individual session cookies for every workspace.

### Options considered

**Impersonation via workspace admin tokens** — for each workspace, palantir fetches the admin token and uses it to construct authenticated requests on behalf of the admin session. Rejected: adds a per-workspace token fetch before each workspace API call, ties the palantir session to admin-level workspace credentials, and makes the auth flow significantly more complex.

**New unauthenticated preview endpoint** — add a separate, publicly accessible route for palantir to read snapshot data. Rejected: snapshots may contain booking titles and organiser names; making them unauthenticated is a meaningful exposure.

**Palantir session as a middleware bypass** — add a check for the `palantir_session` cookie alongside the existing workspace cookie checks. If present, allow the request through. Because `palantir_session` is httpOnly and Secure, it cannot be set by client-side JavaScript — the only way to obtain one is to successfully complete the palantir magic-link email flow.

## Decision

Add a `palantir_session` presence check to the middleware workspace auth block, immediately before the `/enter/{slug}` redirect:

```ts
const palantirSession = request.cookies.get('palantir_session')?.value
if (palantirSession) return pass()
```

This is a presence-only check, consistent with how `palantir_session` is validated everywhere else in the codebase — none of the palantir API routes verify the token against Redis, they check presence only. Strengthening to a Redis-verified check would require the middleware to hit Redis on every request, which meaningfully increases latency across the entire application.

## Consequences

**Better:** A palantir admin can view any workspace page or call any workspace API endpoint with a single authenticated session. This is intentional — palantir is a super-admin tool and this is super-admin access.

**Blast radius:** The bypass applies to all workspace routes, not just tablet views. A valid `palantir_session` grants read and write access to workspace booking pages, admin APIs, and settings endpoints. This is deliberate. If this ever needs scoping (e.g. palantir-read-only vs palantir-admin), the bypass check is the right place to add it.

**Expiry:** The `palantir_session` cookie has a 12-hour browser-enforced expiry. The middleware does not verify the token against Redis, so a token that has been "logically" invalidated (e.g. after sign-out) could persist until the browser expires it. Palantir sign-out deletes the cookie from the browser — a user who signs out then cannot re-use the token from another device.

**What this is not:** This is not a general purpose admin bypass. The `palantir_session` cookie is issued only to email addresses listed in the `PALANTIR_ADMINS` environment variable. It cannot be forged via XSS (httpOnly) or via HTTP (Secure). The set of palantir admins is controlled by whoever has access to Vercel environment variables.

**Future maintainers:** If you add a new type of workspace route that should NOT be accessible to palantir admins (e.g. a workspace-owner-only billing endpoint), you must explicitly check for the absence of a palantir bypass in that handler. The middleware bypass is intentionally broad.
