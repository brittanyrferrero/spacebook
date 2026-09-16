# ADR-017: Distinguish a real Supabase error from "workspace not found"
Date: 2026-09-15
Status: Accepted

## Context

Production started emailing client-side error reports: `E.filter is not a function` on the room detail page (`app/[workspace]/room/[roomId]/page.tsx`), for a workspace slug (`plonk-mango-wizard`) that definitely existed. The crash was intermittent and didn't correlate with any code deploy — it just started happening on a URL that had worked fine before.

Root cause traced to `getWorkspaceBySlug` in `lib/workspace.ts`:

```ts
export async function getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
  const supabase = await getSupabase()
  const { data } = await supabase.from('workspaces').select('*').eq('slug', slug).single()
  return data ?? null
}
```

Only `data` was destructured. Supabase's `.single()` returns `data: null` for two completely different situations: a genuine "no row matched" (error code `PGRST116`), and any other failure — a timeout, a connection blip, a rate limit. This code treated both identically. `getWorkspaceId` (which every workspace-scoped API route calls first) then returned `null` either way, and every route responded `404 { error: 'Workspace not found' }` — for a workspace that was actually fine, just unlucky with a transient DB hiccup on that one request.

That 404 body then hit a second, independent gap: `app/[workspace]/room/[roomId]/page.tsx` and `app/[workspace]/(booking)/page.tsx` both piped `fetch(...).then(r => r.json())` straight into `useState` setters with no check on `res.ok` or on the shape of the parsed body. So `{ error: 'Workspace not found' }` landed in state where an array (`Booking[]`, `Room[]`) was expected, and the next render's `.filter()` call threw `TypeError: [object Object].filter is not a function` — minified by Next.js's client error overlay to `E.filter is not a function`.

Neither half of this is new-code-introduced; both predate this incident and had presumably been "getting lucky" until a transient Supabase error actually happened to land on a real request.

## Decision

**Fix at both layers, not just one.** Either fix alone leaves a real gap:

1. **`lib/workspace.ts`** — `getWorkspaceBySlug` now checks the error code and only treats `PGRST116` (no row found) as "doesn't exist." Any other error is re-thrown:
   ```ts
   const { data, error } = await supabase.from('workspaces').select('*').eq('slug', slug).single()
   if (error && error.code !== 'PGRST116') throw error
   return data ?? null
   ```
   A thrown error propagates out of the calling API route as an uncaught exception, which Next.js turns into a real 500 — correctly distinct from a 404, and it doesn't get cached as "not found" by `getWorkspaceId`'s in-memory cache.

2. **`lib/utils.ts`** — added `fetchJsonArray<T>(url)`, a small helper that resolves to `[]` on a non-ok response, a non-array payload, or a network error, instead of ever handing a non-array to a setter. Every array-returning fetch in the two booking-surface pages (`rooms`, `bookings`, `room-types`) now goes through it.

The second fix matters independently of the first: it also protects against any *future* API route that has some other reason to return a non-array error body, not just this one bug.

## Consequences

**What gets better:**
- A transient Supabase hiccup on a workspace lookup now surfaces as a real 500 (logged, visible in Vercel) instead of a silent, misleading 404 that a future debugging session would waste time chasing as "the workspace doesn't exist."
- A room or booking-index page can no longer crash outright just because one fetch had a bad day — it degrades to an empty list for that render instead.

**What to watch for:**
- `fetchJsonArray` swallows the distinction between "genuinely empty" and "the fetch failed" — both produce `[]`. That's the right tradeoff for a display list (fail safe, don't crash), but don't reuse it anywhere a caller needs to know *whether* the fetch succeeded, not just what it returned.
- This is one instance of a broader pattern worth remembering when writing a new `lib/workspace.ts`-style lookup: `.single()` + destructuring only `data` always conflates "not found" with "errored." Check for it deliberately; TypeScript won't catch it.
- `workspaceExists` (also in `lib/workspace.ts`, used during slug generation on workspace creation) still has the same `{ data }`-only pattern. It wasn't touched here because a false "not taken" during slug generation just means a retry, not a user-facing crash — but it's the same latent shape and would be worth cleaning up in the same pass if that file is touched again.
