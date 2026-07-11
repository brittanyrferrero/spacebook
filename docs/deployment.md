# Deployment

## Deploy workflow

Spacebook runs on Vercel with two deployments: **production** and **demo**. Both point to the same codebase; what differs is environment variables.

The workflow for every change:

1. Create a feature branch and open a PR
2. Vercel automatically builds a preview deployment for the PR
3. Test in the preview (it has its own environment variables, or inherits from preview env)
4. Merge to `main` — Vercel automatically promotes the build to production

There is no manual deploy step. Production is whatever is on `main`.

---

## Two deployments

| Deployment | Purpose | Key difference |
|---|---|---|
| **Production** | Real workspaces, real data | `MOCK_MODE` not set |
| **Demo** | Live demo, no database needed | `MOCK_MODE=true` |

In mock mode the app runs entirely in-memory with seed data. Supabase, Redis, and email are all bypassed. The demo deployment redirects `/` to the `swift-cedar-lake` workspace automatically.

---

## Environment variables

Set these in the Vercel dashboard under **Settings → Environment Variables**. Variables marked **server-only** must not be exposed to the browser; never prefix them with `NEXT_PUBLIC_`.

### App URL

| Variable | Environments | Description |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | All | Canonical public URL, e.g. `https://spacebook.app`. Used in email links, GCal OAuth redirect URIs, and webhook addresses. |
| `NEXT_PUBLIC_BASE_URL` | All | Fallback for `NEXT_PUBLIC_APP_URL` — the app reads whichever is set. Keep both in sync if you set both. |

The code resolves these as: `NEXT_PUBLIC_APP_URL ?? NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'`.

### Supabase

| Variable | Environments | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All | Supabase project URL. Found in Supabase → Project Settings → API. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Supabase anon/public key. Safe to expose to the browser; RLS is on so it cannot read or write any table directly. |
| `SUPABASE_SERVICE_ROLE_KEY` | Production / Preview | **Server-only.** Service role key — bypasses RLS. All server-side database access uses this key. Never set as `NEXT_PUBLIC_`. |

### Upstash Redis (KV)

| Variable | Environments | Description |
|---|---|---|
| `KV_REST_API_URL` | Production / Preview | Upstash Redis REST URL. Used for workspace config, session tokens, admin roles, trial limits, and GCal OAuth nonces. |
| `KV_REST_API_TOKEN` | Production / Preview | Upstash Redis REST token. Server-only. |

### Email

| Variable | Environments | Description |
|---|---|---|
| `RESEND_API_KEY` | Production / Preview | Resend API key. If absent, emails are silently skipped — safe to omit in preview environments where you don't want real mail sent. |
| `EMAIL_FROM` | Production / Preview | Sender address shown in emails, e.g. `Spacebook <noreply@spacebook.app>`. Defaults to `spacebook <noreply@spacebook.app>` if not set. |

### Admin and security

| Variable | Environments | Description |
|---|---|---|
| `ADMIN_PASSWORD` | All | Password required to access any workspace's `/[workspace]/admin` panel. Shared across all workspaces. |
| `PALANTIR_ADMINS` | All | Comma-separated list of email addresses that can access the Palantir super-admin panel at `/palantir`. Example: `alice@example.com,bob@example.com`. |
| `CRON_SECRET` | Production | Bearer token used by Vercel Cron to authenticate the daily GCal webhook renewal job at `/api/gcal-renew`. If not set, the endpoint is unprotected. Set this in production. |

### Google Calendar (optional)

| Variable | Environments | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Production / Preview | OAuth 2.0 client ID from Google Cloud Console. Required for admin-initiated GCal connections. |
| `GOOGLE_CLIENT_SECRET` | Production / Preview | OAuth 2.0 client secret. **Server-only.** |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Production / Preview | Full service account JSON key as a single string. Required if using the service account path for GCal sync (not the OAuth path). Paste the entire JSON value. |

### Mock mode

| Variable | Environments | Description |
|---|---|---|
| `MOCK_MODE` | Demo deployment only | Set to `true` to run the app entirely in-memory with no database. Used for the demo deployment. When set, Supabase, Redis, and email are all skipped. |

---

## Supabase migrations

Migrations are not run automatically. You must apply them manually via the Supabase SQL editor.

1. Open your Supabase project → **SQL Editor**
2. Run each file from `supabase/migrations/` in order:

```
001_initial.sql
002_multi_tenant.sql
003_tablet_token.sql
004_tablet_token_shorten.sql
005_booking_origin.sql
006_enable_rls.sql
007_workspace_name_length.sql
008_room_blocks.sql
009_room_gcal_resource.sql
010_block_group_id.sql
```

Migration `006_enable_rls.sql` enables Row Level Security on all tables. This is required — once RLS is on, the anon key cannot directly read or write any table. All server-side access uses `SUPABASE_SERVICE_ROLE_KEY`.

Migration `007_workspace_name_length.sql` adds a CHECK constraint limiting workspace display names to 200 characters. Apply this to any existing Supabase projects that are running migration 006 but not 007.

Migration `008_room_blocks.sql` adds the `is_block` column on `bookings`, used by the room-blocking feature (Admin → Rooms → Block).

Migration `009_room_gcal_resource.sql` adds the `gcal_resource_email` column on `rooms`, used for the optional GCal cart resource on a room. **This one is easy to miss** — the admin panel's room edit form always includes this field in its save payload, so if this migration hasn't been applied, every room save fails with a PostgREST "column not found" error.

Migration `010_block_group_id.sql` adds the `block_group_id` column on `bookings`, used to tie together the same-day rows a multi-day room block gets split into. **Apply this before deploying the multi-day-block-split code** — the block-creation route inserts a `block_group_id` value on every block it creates (not just multi-day ones), so without this column, every room block creation fails with a PostgREST "column not found" error, the same failure mode as migration 009 above.

Run new migration files in the same way as they are added to the repo.

---

## Google Cloud Console setup

Google Calendar sync uses OAuth 2.0. The OAuth app must have the following redirect URI registered:

```
https://your-app-url.com/api/gcal/callback
```

Replace `your-app-url.com` with the value of `NEXT_PUBLIC_APP_URL`.

Steps:

1. Go to **Google Cloud Console → APIs & Services → Credentials**
2. Create or edit an OAuth 2.0 Client ID (type: **Web application**)
3. Under **Authorized redirect URIs**, add `/api/gcal/callback` on your production URL
4. Copy the **Client ID** and **Client Secret** into Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
5. Enable the **Google Calendar API** in **APIs & Services → Library**

The GCal OAuth flow is initiated from the admin panel (Rooms tab → Connect Google Calendar). It requires an admin session cookie.

---

## Vercel Cron

`vercel.json` configures a daily cron job:

```json
{
  "crons": [
    { "path": "/api/gcal-renew", "schedule": "0 2 * * *" }
  ]
}
```

This runs at 2 AM UTC every day and renews any GCal push notification webhooks that are within two days of expiry. Google push notification subscriptions last approximately 7 days.

The cron job authenticates via the `Authorization: Bearer <CRON_SECRET>` header. Set `CRON_SECRET` in Vercel production environment variables.

---

## Operational gotchas

### App URL changes break GCal webhooks

Google push notification webhooks are registered with a callback URL of the form:

```
{NEXT_PUBLIC_APP_URL}/api/{workspace}/gcal/webhook
```

If `NEXT_PUBLIC_APP_URL` changes (e.g. a domain migration), all existing webhook registrations point to the old URL and will stop delivering notifications. After changing the URL:

1. Update `NEXT_PUBLIC_APP_URL` in Vercel
2. For each room with GCal connected: disconnect and reconnect Google Calendar from the admin panel to re-register the webhook with the new URL

### Webhook signature fix — migration for existing connected rooms

PR #72 added HMAC signature verification to the GCal webhook handler. Rooms connected **before that deploy** have no `webhookToken` stored in KV, so their webhook POSTs are now silently rejected (the token in the `X-Goog-Channel-Token` header does not match anything on record).

To fix: disconnect and reconnect Google Calendar for any affected room via **Admin → Rooms → the room's GCal settings**. Reconnecting re-registers the webhook and stores a fresh token in KV.

### Reserved workspace slug segments

Workspace slugs are validated against `RESERVED_SLUGS` in `lib/workspace.ts` at rename time. A workspace named after a public route segment would cause the middleware to skip authentication for all that workspace's API routes.

The full reserved list covers all values in `PUBLIC_API_SEGMENTS` and `PUBLIC_SEGMENTS` in `middleware.ts`, plus `api` and `_next`. Notable entries:

- `version` — the deployment version polling endpoint (`/api/version`)
- `gcal` / `gcal-renew` — GCal OAuth and cron endpoints
- `admin`, `cancel`, `workspaces` — top-level API routes
- `enter`, `demo`, `generate`, `privacy`, `terms` — top-level page routes

The slug generator produces three-word slugs (e.g. `amber-oak-vale`) that never collide with reserved names. If you add a new public route segment to `middleware.ts`, add it to `RESERVED_SLUGS` in `lib/workspace.ts` at the same time.

### Slug renames invalidate all sessions

Renaming a workspace URL immediately invalidates all existing session cookies for that workspace. Users will be redirected to re-enter the workspace. This is by design — the URL is the access credential.
