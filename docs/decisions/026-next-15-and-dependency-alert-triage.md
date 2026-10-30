# ADR-026: Upgrade to Next.js 15.5 and triage the Dependabot backlog
Date: 2026-10-22
Status: Accepted

## Context

GitHub reported 56 open Dependabot alerts on `main` (2 critical, 23 high, 27 moderate,
4 low). They fell into three groups:

1. **Next.js itself** (25 alerts, including both criticals). We were on `next@14.2.35`,
   the final 14.x release. None of the fixes are backported to 14; every one needs 15.5.x.
2. **Transitive packages with patched versions inside our existing semver ranges**
   (ws, nanoid, qs, postcss, js-yaml, vite/vitest, brace-expansion, uuid via svix, …).
3. **Transitive packages we can't patch without a major upgrade of something else**
   (Tailwind 3, `googleapis`, `@supabase/ssr`, the `postcss` pinned inside Next).

### How the Next.js alerts apply to us

| Alert | Applies? |
|---|---|
| Critical: RCE via Image Optimization with AVIF | Unlikely: no `next/image`, no `images.remotePatterns`, and Vercel serves `/_next/image` from its own infrastructure |
| Critical: RCE on Windows-hosted servers | No, Vercel runs Linux |
| Middleware bypass (Pages Router + i18n); SSRF via rewrites, Server Actions on custom servers, WebSocket upgrades | No: we use none of these |
| DoS in Server Components / App Router, RSC cache poisoning, response cache confusion | **Yes**: public App Router app |

So it isn't an emergency, but a public app is exposed to DoS and cache poisoning until it upgrades.

## Decision

**1. Lockfile-only `npm audit fix`** (PR #185). Every bump stays within existing semver
ranges. Lowest risk, clears most of group 2.

**2. Next.js 14.2.35 → 15.5.28, keeping React 18** (PR #186). Next 15.5 still lists
React 18 as a supported peer, and the App Router runs on Next's bundled React
regardless, so staying on 18 keeps this a security upgrade rather than also a React
migration. The `next-async-request-api` codemod converted ~49 files to `await
props.params` / `await cookies()` / `await headers()`. Client components read route
params with `useParams()` (not React 19's `use()`, which the codemod reached for in
`app/room/[roomId]/page.tsx`). `serverComponentsExternalPackages` became
`serverExternalPackages`.

**3. Remove the unused browser Supabase client** (`lib/supabase/client.ts`) and
`@supabase/ssr`. Nothing imported it, and the frontend must never query Supabase
directly (RLS locks out the anon key; see `docs/runbooks/supabase-errors.md`). This also
removes `cookie@0.5.0`.

**4. Accept and dismiss the rest**, with the reason recorded on each Dependabot alert:

| Package | Comes from | Why it's accepted | Revisit when |
|---|---|---|---|
| `postcss` < 8.5.23 | `next@15.5.28` pins `postcss@8.4.31` | Build-time only, and only processes our own CSS; never sees attacker input. Top-level `postcss` is already patched. | A Next release bumps its pinned copy |
| `postcss-selector-parser` < 7.1.6, `braces` | `tailwindcss@3` | Build-time only, over our own CSS/source files | We move to Tailwind 4 for its own sake |
| `uuid` < 11.1.1 | `googleapis@140` | The flagged bug is in v3/v5/v6 with a caller-supplied buffer; googleapis only uses v4 | We upgrade `googleapis` for a GCal reason |

## Consequences

- **Next 15 behaviour changes:** GET route handlers and `fetch` are no longer cached
  by default. Our routes already read cookies or set `force-dynamic`, so nothing relied
  on the old caching, but new routes should not assume caching either.
- **New route handlers** must use the async signature:
  `export async function GET(req, props: { params: Promise<{ workspace: string }> }) { const params = await props.params }`.
  `next build`'s type check rejects the old `{ params }: { params: {...} }` form.
- **React 19** is a separate, optional follow-up. When it happens, `use()` becomes
  available in client components, and `@types/react`/`@types/react-dom` move to 19.
- **ESLint** is still not configured in this repo (`next lint` prompts for setup), so
  `eslint-config-next` is installed but unused.
- **Handling future Dependabot alerts:** dismissed alerts carry their reason. A new
  alert on one of the accepted packages is worth re-checking against the table above
  rather than auto-dismissing: the "why it's safe" may not hold for a different bug.
