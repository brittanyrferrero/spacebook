# ADR-002: Path-based multi-tenancy
Date: 2026-06-05
Status: Accepted

## Context

Multi-tenant web apps commonly use one of two URL models:

- **Subdomain-based:** `{slug}.spacebook.app` — each workspace is a different origin
- **Path-based:** `spacebook.app/{slug}` — all workspaces share a single origin

The choice has downstream effects on cookies, middleware, and deployment.

## Decision

Spacebook uses path-based multi-tenancy. Workspaces live at `/{slug}/`, not at `{slug}.spacebook.app`.

## Consequences

### Why path-based

**Vercel deployment model.** A Vercel project maps to a single deployment with a single primary domain. Serving wildcard subdomains from a single Next.js app requires configuring a wildcard custom domain (`*.spacebook.app`) in both Vercel and DNS, then detecting the tenant from the hostname in middleware. This is possible but adds DNS management overhead and doesn't work cleanly on preview deployments (preview URLs are `*.vercel.app`, not `*.spacebook.app`).

Path-based routing requires no DNS configuration beyond the single root domain, and preview deployments work identically to production.

**Cookie scoping.** Cookies are scoped to a domain, not a path. If workspaces were subdomain-based, session cookies for `amber.spacebook.app` could not be set by `cedar.spacebook.app` — correct isolation, but it means the demo and production deployments would need separate root domains, and cross-workspace redirects (e.g. the `/cancel` endpoint, which is not workspace-scoped) would need careful cookie handling.

With path-based routing, all cookies are on the same domain (`spacebook.app`). Workspace isolation is handled by naming: session cookies are named `ws_{slug}` and admin cookies are named `admin_{slug}`. Middleware checks for the slug-specific cookie, not a generic session. This is simpler and sufficient given that cookies are httpOnly and the session model doesn't require browser-level isolation.

**Next.js middleware simplicity.** With path-based routing, the workspace slug is in `request.nextUrl.pathname`. Middleware can extract it with a string split, check for the slug-specific cookie, and redirect if missing — all without any async lookups or host parsing.

**Two deployments, one codebase.** The demo deployment (`MOCK_MODE=true`) and the production deployment run the same code with different environment variables. Both live on the same Vercel project. Subdomain routing would complicate this: the demo workspace (`swift-cedar-lake`) would need to resolve `swift-cedar-lake.spacebook.app`, which is a DNS problem that path-based routing sidesteps entirely.

### What path-based routing costs

**No browser-level isolation.** All workspaces share a single origin, which means a workspace's cookies and JS are technically in the same origin as every other workspace's cookies and JS. In practice this doesn't matter — the server enforces workspace isolation on every query, and client-side JS runs within the context of a single workspace page load. But it's worth knowing if you ever consider allowing user-submitted content (which could try cross-origin reads within the same origin).

**Reserved slug namespace.** Any word that appears as a top-level Next.js page route, or as a second path segment in `/api/`, is a reserved slug. The full reserved list lives in `middleware.ts` (`PUBLIC_SEGMENTS` and `PUBLIC_API_SEGMENTS`). The most important ones to avoid: `gcal`, `gcal-renew`, `admin`, `palantir`, `cancel`, `enter`, `generate`. The three-word slug generator produces slugs that don't collide with any of these, but manual renames should be checked against `middleware.ts`.

**Slug renames are more disruptive.** With subdomain routing, the workspace identifier (the subdomain) can change independently of the URL path. With path-based routing, the slug is the entire workspace identity — it's in every cookie name, every URL, every email link. Renaming it changes everything at once. This is by design (it's the access revocation mechanism), but it's more total than a subdomain rename would be.

### Workspace isolation guarantees

Every Supabase query that accesses workspace data filters by `workspace_id`. Every Redis key is prefixed `ws:{workspaceId}:`. These are application-layer invariants, not database or OS-level isolation. The consequence is: if a query is ever written without a `workspace_id` filter, it would silently return data from all workspaces. The RLS policy on Supabase doesn't prevent this (service role key bypasses RLS — see `docs/runbooks/supabase-errors.md`). The isolation is enforced by code discipline, not by a database enforcement layer.
