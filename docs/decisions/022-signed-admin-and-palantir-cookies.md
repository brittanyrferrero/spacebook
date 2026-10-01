# ADR-022: Sign admin and Palantir session cookies
Date: 2026-09-30
Status: Accepted

## Context

`admin_{slug}` held the plain role string (`'admin'` or `'super_admin'`) and
`palantir_session` held the plain email. Every check in the app, including
middleware, admin routes, Palantir routes and layouts, only asked whether the
cookie *existed*. A few routes also read the role straight from the cookie.

`httpOnly` stops page JavaScript from reading or writing a cookie. It does
nothing to stop an HTTP client from *sending* any cookie it likes, and the
server can't tell a cookie it issued from one typed by hand. So:

- `Cookie: admin_<slug>=super_admin` gave full super admin of any workspace
  whose slug you knew. Slugs are shared with the whole team by design.
- `Cookie: palantir_session=x` gave Palantir super admin across every
  workspace. That included `DELETE /api/palantir/workspaces/[id]`, which
  deletes a workspace and all its bookings using the service-role key. It
  needed no slug, only a workspace ID, and the forged cookie also unlocked the
  route that lists them.

ADR-001's 2026-09-17 note had treated this as a risk only behind a
misconfigured proxy, and was corrected on 2026-09-30 (PR #169). Tracked as #163.

## Decision

Both cookies now carry a signed value: `base64url(value).expiry.base64url(HMAC-SHA256)`,
keyed by a new `SESSION_SECRET` env var. Signing and verifying live in
`lib/auth-cookies.ts` (`setAdminCookie` / `readAdminRole`, `setPalantirCookie` /
`readPalantirSession`), and every former presence check goes through them.

- **The HMAC covers kind and scope, not just the value.** That's
  `admin|<slug>|<role>|<exp>` or `palantir|-|<email>|<exp>`. An admin cookie
  from workspace A fails as workspace B, and neither passes as a Palantir
  session.
- **The expiry is inside the signature.** Before, the only limit was the
  browser's `maxAge`, which a hand-made cookie ignores. Lifetimes stay the
  same: 7 days for admin, 12 hours for Palantir.
- **Palantir also re-checks `PALANTIR_ADMINS`** on every request, so removing
  someone from the env var revokes them straight away. This is one env lookup
  with no I/O.
- **Web Crypto, not `node:crypto`,** so middleware (Edge runtime) can verify
  too.
- **It fails closed.** In production (`NODE_ENV=production`) a missing
  `SESSION_SECRET` makes every check reject and logs
  `[auth-cookies] SESSION_SECRET is not set`. Only local dev falls back to a
  fixed dev secret. Mock-mode deployments get no exception, because the
  Palantir routes don't check `MOCK_MODE` and the dev secret is public in
  the repo.

We chose signing over a server-side session store (an opaque ID mapped to the
role in KV). A store would allow per-session revocation, but it adds a KV read
to every admin request and every middleware pass, and ADR-001's design avoids
that kind of machinery on purpose. Rotating `SESSION_SECRET` is the emergency
"log everyone out" switch.

### What is deliberately *not* signed

- **`ws_{slug}`** stays presence-only. Under ADR-001 the slug *is* the
  workspace credential, and some entry paths (`enter-set-cookie`,
  `my-bookings-enter`) set the cookie's value to the slug itself. A forged
  `ws_` cookie grants nothing that knowing the slug doesn't already grant.
  Revisit this only if ADR-001's model changes.
- **`admin_access`** (legacy, pre-workspace `/admin` page). Nothing sets it
  any more. Forging it only loads a shell page whose `/api/admin/*` calls
  return 410 or need the bearer master token. It's dead code and should be
  deleted, but that's separate from this fix.

## Consequences

**Better:**
- Neither cookie can be forged or edited, carried to another workspace, or
  kept alive past its expiry.
- The auth rule now lives in one helper instead of ~35 copy-pasted
  `cookies.get(...)?.value` checks, so a new route can't quietly use a weaker
  check.

**Worse / things to know:**
- **Deploying this logs out every admin and Palantir user once.** Old
  cookies don't verify. Tablets and members (`ws_`) aren't affected.
- **`SESSION_SECRET` must be set in each deployment (prod, demo, previews)
  before deploying.** If it's missing, production fails closed and nobody can
  use admin or Palantir. That includes the demo deployment.
- **Removing an admin from a workspace doesn't revoke their cookie** until it
  expires (up to 7 days). That was already true before. Fixing it needs a
  role re-check against KV on each request; we didn't do that here to keep
  the fix small.
