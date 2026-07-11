# Setup guide

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Upstash Redis](https://upstash.com) database
- A [Resend](https://resend.com) account (for email)
- A Google Cloud service account (optional, for Google Calendar sync)

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in the values below.

### Supabase

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (secret — server only) |

Find these in Supabase → Project Settings → API.

### Upstash Redis (KV)

| Variable | Description |
|---|---|
| `KV_REST_API_URL` | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | Upstash Redis REST token |

Used to store workspace config, admin roles, trial limits, and session tokens. Create a database at [upstash.com](https://upstash.com) and copy the REST credentials.

### Email

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Sender address, e.g. `Spacebook <noreply@spacebook.app>` |

Email is optional locally — if `RESEND_API_KEY` is missing, emails are silently skipped.

### App

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Public URL of the app, e.g. `https://spacebook.app`. Used in email links, GCal OAuth redirect URIs, and webhook addresses. |
| `NEXT_PUBLIC_BASE_URL` | Legacy fallback for `NEXT_PUBLIC_APP_URL`. The app reads whichever is set: `NEXT_PUBLIC_APP_URL ?? NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'`. Set `NEXT_PUBLIC_APP_URL` going forward; both are accepted for backwards compatibility. |

### Admin

| Variable | Description |
|---|---|
| `ADMIN_PASSWORD` | Password for admin dashboard access |
| `PALANTIR_ADMINS` | Comma-separated list of emails that can access the Palantir super-admin panel |
| `CRON_SECRET` | Secret token for authenticating cron job requests |

### Google Calendar (optional)

| Variable | Description |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Full JSON service account key (paste as a single string) |

To enable calendar sync, create a service account in Google Cloud Console with the Google Calendar API enabled, download the JSON key, and paste the entire JSON as the value of this variable.

---

## Database setup

Run the migrations in order against your Supabase project. Open the SQL Editor in the Supabase dashboard and run each file from `supabase/migrations/`:

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

Migration `006_enable_rls.sql` enables Row Level Security on all tables. This is required — once RLS is on, the anon key (which is public in the browser) cannot directly read or write any table. All access goes through the server using `SUPABASE_SERVICE_ROLE_KEY`.

Migration `007_workspace_name_length.sql` adds a CHECK constraint limiting workspace display names to 200 characters.

Migration `008_room_blocks.sql` adds the `is_block` column on `bookings`, used by the room-blocking feature (Admin → Rooms → Block).

Migration `009_room_gcal_resource.sql` adds the `gcal_resource_email` column on `rooms`, used for the optional GCal cart resource on a room.

Migration `010_block_group_id.sql` adds the `block_group_id` column on `bookings`, used to tie together the same-day rows a multi-day room block gets split into. Every block creation (not just multi-day) writes this column, so it must be applied before deploying that code.

---

## Local development

```bash
npm install
npm run dev
```

### Mock mode (no database required)

Set `MOCK_MODE=true` in `.env.local` to run the app entirely in-memory with seed data. This is useful for UI development and demos — no Supabase or Redis connection needed.

### Creating a workspace

Navigate to `/generate` and follow the prompts. The first person to claim the workspace becomes its super-admin.
