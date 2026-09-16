# Runbook: Supabase errors

**Symptom:** API routes return 500 errors, rooms or bookings appear empty when they shouldn't be, or Vercel logs show Supabase query errors.

---

## The most important thing to know about Spacebook's Supabase setup

**RLS is enabled on all tables. The anon key cannot read or write any table.**

Migration `006_enable_rls.sql` enables Row Level Security on all tables with no permissive policies. This means:

- The **anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) is completely locked out of all data. The frontend does not (and must not) query Supabase directly.
- All database access goes through the server using the **service role key** (`SUPABASE_SERVICE_ROLE_KEY`). The service role key bypasses RLS.

If you try to query any table from a client that uses the anon key, you will get an empty result (`data: []` or `data: null`) with no error — RLS silently returns nothing when no policies match. This is the most common source of confusion: the query looks like it succeeded but returned empty data.

---

## Diagnosis checklist

### 1. Is `SUPABASE_SERVICE_ROLE_KEY` set correctly?

Check Vercel → Settings → Environment Variables. The service role key should be set for `Production` and `Preview` environments (not just `Development`).

- If it's missing entirely, **all** database reads and writes will silently fail with empty data
- If it's set to the anon key by mistake, same result — the anon key has no table access
- If it's set but wrong (e.g. from a different Supabase project), you'll get `401 Invalid API key` errors

To verify the key is correct: open Supabase → Project Settings → API → `service_role` (secret). Compare the first 20 characters to the value in Vercel.

### 2. Is `NEXT_PUBLIC_SUPABASE_URL` pointing to the right project?

If you have multiple Supabase projects (e.g. a separate one for staging), check that the URL and keys all refer to the same project. Mixing a URL from project A with a service role key from project B will give auth errors.

### 3. Are the migrations up to date?

Migrations are not applied automatically. Each new migration file in `supabase/migrations/` must be run manually via the Supabase SQL Editor.

Run this query in the SQL Editor to check what's present:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'workspaces' AND column_name = 'name';
```

If that returns nothing, migration 001 hasn't been run. If `name` exists but there's no constraint named `workspace_name_length`, migration 007 hasn't been run.

Current migrations and what they do:

| Migration | What it adds |
|---|---|
| `001_initial.sql` | Initial schema: `rooms`, `bookings` tables |
| `002_multi_tenant.sql` | Adds `workspaces` table, `workspace_id` FK on rooms and bookings, members table |
| `003_tablet_token.sql` | Adds `tablet_token` column to rooms |
| `004_tablet_token_shorten.sql` | Shortens tablet token to 6 characters |
| `005_booking_origin.sql` | Adds `origin` column to bookings (desktop/tablet/gcal) |
| `006_enable_rls.sql` | Enables Row Level Security on all tables — **required** |
| `007_workspace_name_length.sql` | Adds CHECK constraint: workspace name ≤ 200 characters |

To apply a missing migration: copy the SQL from the file and paste it into Supabase → SQL Editor → New query → Run.

### 4. Verifying RLS is enabled

In Supabase → Table Editor, click any table name. In the right panel, look for the RLS toggle. It should show "RLS enabled." If it shows "RLS disabled" on any table, run migration `006_enable_rls.sql`.

You can also check in the SQL Editor:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

All tables should show `rowsecurity = true`.

---

## Common error patterns

### Bookings or rooms return empty arrays

Symptom: the API returns `[]` or `{ rooms: [], bookings: [] }` when the database has data.

Most likely cause: `SUPABASE_SERVICE_ROLE_KEY` is wrong or missing. The query runs using the anon key, RLS blocks all rows, and Supabase silently returns empty data.

Check: verify the service role key in Vercel as described above.

### `Invalid API key` in Vercel logs

The key being used doesn't match any key in the Supabase project. Could be: wrong project URL, key was rotated in Supabase without updating Vercel, or anon key used where service role key is expected.

Fix: rotate or re-copy the service role key from Supabase → Project Settings → API, and update it in Vercel.

### `relation "workspaces" does not exist` (or similar)

The migration that creates the table hasn't been run. Apply the migration in the Supabase SQL Editor.

### `violates check constraint "workspace_name_length"` (409 from rename-slug or settings endpoint)

Migration 007 added a 200-character limit on workspace names. This should never be hit in normal use (the UI enforces a limit), but if you're seeding data programmatically or testing, be aware the constraint exists.

---

## A transient Supabase error crashing a page with `.filter is not a function`

**Symptom:** A client-side error report (Next.js error overlay, or an email if that's wired up) showing something like `E.filter is not a function` on the room detail page or the workspace booking index, for a workspace that definitely exists and usually works fine.

**Cause:** `getWorkspaceBySlug` (`lib/workspace.ts`) distinguishes a genuine "no row found" (Postgres/PostgREST code `PGRST116`) from any other Supabase error — see [ADR-017](../decisions/017-workspace-lookup-error-vs-not-found.md). Before that fix, *any* error from the `workspaces` lookup (a timeout, a connection blip) was treated identically to "workspace doesn't exist," so a transient hiccup made a real workspace's API routes respond `404 { error: 'Workspace not found' }` for one request. The room/booking pages didn't check `response.ok` before setting state, so that error object landed where an array was expected, and the next render's `.filter()` call threw.

**This class of bug should no longer be reproducible** — `getWorkspaceBySlug` now re-throws on a real error instead of returning `null`, and `fetchJsonArray` (`lib/utils.ts`) guards every array-returning fetch on the two booking-surface pages against a non-array response. If you see this error again:

1. Check whether it's actually a genuine 404 (visit the URL directly, confirm the workspace truly doesn't exist) — if so, this isn't the bug, just a bad link.
2. If the workspace does exist, check Vercel logs for an uncaught exception around the time of the report — `getWorkspaceBySlug` now throws real errors instead of swallowing them, so they should be visible server-side instead of silent.
3. Check whether a *new* fetch was added to `room/[roomId]/page.tsx` or `(booking)/page.tsx` that bypasses `fetchJsonArray` (a raw `fetch(...).then(r => r.json())` feeding a `useState` setter directly) — that's the pattern to avoid for anything expected to be an array.

## Supabase free tier limits

On the free tier, Supabase pauses databases that are inactive for more than 7 days. A paused database returns connection errors until the project is unpaused via the Supabase dashboard. If you're on the free tier and the app returns 500 errors after a period of no activity, check the Supabase dashboard first.

The free tier also has a 500 MB database size limit and 2 GB transfer/month. For a small deployment these should not be hit, but if you're seeing rate limiting or quota errors from Supabase, check your project usage in the Supabase dashboard.
