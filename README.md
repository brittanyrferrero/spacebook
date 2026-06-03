# Spacebook

Spacebook is a frictionless meeting room booking system for coworking spaces and shared offices. No accounts, no apps — just a URL.

## Features

- **Multi-tenant** — each organisation gets its own isolated workspace at `spacebook.app/[workspace]`
- **Real-time calendar** — day, week, and month views with live availability
- **Tablet kiosk** — door-mounted displays show room status and allow walk-in bookings
- **Google Calendar sync** — rooms can be linked to Google Calendar; conflicts are rejected with Spacebook as the source of truth
- **Recurring bookings** — weekly, biweekly, and monthly patterns
- **Admin dashboard** — manage rooms, members, bookings, analytics, and settings
- **Trial limits** — new workspaces start with capped resources; upgrades are managed via Palantir

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL) |
| KV / config | Upstash Redis |
| Email | Resend |
| Calendar | Google Calendar API (service account) |
| Deployment | Vercel |

## Quick start

```bash
git clone https://github.com/brittanyrferrero/spacebook.git
cd spacebook
cp .env.local.example .env.local   # fill in your values
npm install
npm run dev
```

Open [http://localhost:3000/generate](http://localhost:3000/generate) to create your first workspace.

For local development without a database, set `MOCK_MODE=true` in `.env.local` — the app runs entirely in-memory.

## Documentation

- [Setup guide](docs/setup.md) — environment variables, Supabase, Redis, Google Calendar
- [Architecture](docs/architecture.md) — how multi-tenancy, auth, and data models work
- [Deployment](docs/deployment.md) — Vercel deploy workflow
- [Admin guide](docs/admin-guide.md) — using the admin dashboard
