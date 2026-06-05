# ADR-004: GCal OAuth callback — from workspace-scoped to global
Date: 2026-06-05
Status: Accepted

## Context

Google Calendar sync requires an OAuth 2.0 flow: the admin initiates it from the admin panel, Google redirects back to Spacebook with an auth code, and Spacebook exchanges the code for tokens. The callback URL must be registered in Google Cloud Console ahead of time — Google will refuse redirects to unregistered URLs.

This was a multi-stage bug. The history matters because the same failure mode could resurface if the routing is changed.

## The original design and why it broke

**Commit history:** The original callback was at `/api/[workspace]/gcal/callback` — a workspace-scoped route. This seems natural: the workspace is already in the URL, and the callback belongs to a specific workspace admin session.

**The problem:** Next.js middleware runs on every request, including `/api/[workspace]/gcal/callback`. The middleware's `getWorkspaceSlug()` function parses the URL path and returns the second segment after `/api/` as the workspace slug. For `/api/amber-oak-vale/gcal/callback`, it returned `amber-oak-vale` — correct. But the middleware then checked for a `ws_amber-oak-vale` or `admin_amber-oak-vale` cookie.

When Google redirects back to your app after OAuth, it's a fresh browser request from `accounts.google.com`. Any cookies that were set during the OAuth initiation are subject to the browser's SameSite policy. Modern browsers (SameSite=Lax default) do not send cookies on cross-site redirects. So the `admin_{workspace}` cookie that the admin had when they clicked "Connect Google Calendar" was not sent with the OAuth callback request from Google.

Result: the middleware saw no valid cookie, concluded the user wasn't authenticated, and redirected to `/enter/{workspace}` — destroying the OAuth callback entirely. The auth code parameter that Google sent was discarded in the redirect. GCal connection never worked.

**What was tried first (and why it failed):**

An early attempt added the `admin_{workspace}` cookie check directly to the callback handler — but this runs after middleware, so by the time the handler sees the request, it has already been redirected away. The cookies aren't present for the same SameSite reason.

A second attempt tried to pass the admin authentication state through the OAuth `state` parameter (the opaque string Google echoes back in the callback). But the admin cookie was still needed to verify that state in the callback, so this was circular.

## Decision

Two changes shipped together:

**1. Move the callback to a global (non-workspace-scoped) route:** `/api/gcal/callback`. This URL has no workspace slug as a path segment, so the middleware's `getWorkspaceSlug()` returns `null`, and the middleware passes the request through without any cookie check. The callback handles its own authentication.

The old workspace-scoped route (`/api/[workspace]/gcal/callback`) still exists but now immediately forwards to the global route, preserving any old bookmarks.

**2. CSRF nonce in KV as the auth mechanism:** Since the callback can't rely on cookies, it needs another way to verify that the flow was legitimately initiated by an authenticated admin. The solution (PR #34):

- When an admin clicks "Connect Google Calendar," the auth route (`/api/[workspace]/gcal/auth`) generates a UUID nonce, stores it in Redis as `gcal:nonce:{nonce}` with a 10-minute TTL, along with the workspace slug and room ID. The nonce is included in the OAuth `state` parameter.
- When Google redirects to `/api/gcal/callback`, the callback reads the nonce from `state`, looks it up in Redis, and consumes it (delete-on-read to prevent replay). If the nonce matches the workspace and room, the flow is legitimate. If not (expired, wrong workspace, already used), the callback redirects to the admin panel with an error code.

A secondary check validates the room ID against the workspace in Supabase, preventing cross-workspace token writes even if an attacker constructs a valid-looking state parameter.

**3. Register the global callback in Google Cloud Console:** The single URI `{NEXT_PUBLIC_APP_URL}/api/gcal/callback` is registered. No workspace-specific URIs are needed. Previously, if a new workspace was created and Google Cloud Console hadn't been updated with its callback URI, the OAuth flow would fail at the Google side with a "redirect_uri_mismatch" error. Now there's one URI to register, regardless of how many workspaces exist.

## Consequences

**What got better:**
- GCal OAuth connection works reliably across all browsers.
- One callback URI registered in Google Cloud Console. New workspaces don't require any GCP changes.
- The nonce mechanism is the right CSRF pattern: it proves the flow was initiated by an authenticated admin, is single-use, and expires after 10 minutes.

**What future maintainers must know:**

The `gcal` segment is in `PUBLIC_API_SEGMENTS` in `middleware.ts`. If that entry is ever removed (e.g. during a middleware refactor), `/api/gcal/callback` will start being treated as a workspace-scoped route for a workspace named `gcal`. The middleware will look for `ws_gcal` and `admin_gcal` cookies, find none, and redirect to `/enter/gcal`. GCal connections will silently break. The operational symptom is: admin clicks "Connect" and ends up at an "Enter workspace" page with a URL of `/enter/gcal`.

The `gcal-renew` segment must also stay in `PUBLIC_API_SEGMENTS` for the daily cron job to function.

**GCal OAuth flow summary (current state):**

1. Admin visits `/{workspace}/admin` (Rooms tab) → clicks "Connect GCal" for a room
2. Browser requests `/api/{workspace}/gcal/auth?room_id={id}` (workspace admin cookie present here, same-site)
3. Auth route: generates nonce, stores `gcal:nonce:{nonce}` → `{workspace, roomId}` in KV (10 min TTL), builds OAuth URL with `state={workspace, roomId, nonce}`, redirects to Google
4. Google: user authorises, Google redirects to `{appUrl}/api/gcal/callback?code=...&state=...`
5. Callback route: parses state, verifies+consumes nonce from KV, validates room ownership via Supabase, exchanges code for tokens, saves tokens to KV as `gcal:tokens:{roomId}`, redirects admin back to admin panel with `?gcal=pick&room_id={id}`
