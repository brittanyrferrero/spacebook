# Runbook: Workspace inaccessible

**Symptom:** An admin cannot access their workspace admin panel. Common scenarios:
- The `admin_{slug}` cookie expired (7-day lifetime) and the admin has forgotten the admin password
- The workspace slug was renamed and the admin doesn't have the new URL
- The admin's browser cleared cookies
- The workspace was created but never claimed (no super admin set)

---

## Case 1: Admin locked out — forgot admin password

The admin password is the `ADMIN_PASSWORD` environment variable set in Vercel. It's a single global password shared across all workspaces on the deployment.

**If you know the password:** Go to `/{workspace}/admin` and enter it. You'll get a fresh `admin_{slug}` cookie.

**If the password is unknown:** Look it up in Vercel → Settings → Environment Variables. Only someone with Vercel project access can retrieve it. If you have that access, copy the value and enter it at `/{workspace}/admin`.

**If you don't have Vercel access:** Contact the person who manages the Vercel deployment. There is no in-app way to reset the admin password — it's a deployment-level secret.

---

## Case 2: Admin recovery email (for registered super admins)

If the admin is a registered super admin (their email is in Redis under `ws:{workspaceId}:cfg:admins`), they can use the recovery flow:

1. Go to `/{workspace}/admin` (the admin entry page)
2. Click **Forgot access? Request a recovery link**
3. Enter their email address
4. They will receive an email with a one-time recovery link (the link is valid for 1 hour and is consumed on first use)
5. Clicking the link sets a new `admin_{slug}` cookie and takes them directly to the admin panel

The recovery email links to `/{workspace}/admin-recover?nonce={uuid}`. The nonce is stored in Redis as `recovery:nonce:{uuid}` → `workspaceId` with a 1-hour TTL. After use, the nonce is deleted to prevent replay via browser history or email forwarding.

**If the recovery email doesn't arrive:**

- Check spam. The email comes from the address in `EMAIL_FROM` (default: `spacebook <noreply@spacebook.app>`).
- Check that `RESEND_API_KEY` is set in Vercel. If it's missing, emails are silently skipped — no error is shown to the user.
- Check the Resend dashboard → Logs to see whether the email was sent and what happened to it.
- If Resend shows the email was delivered but it's not in the inbox, check spam or confirm the email address is correct.

**If the recovery email arrives but the link doesn't work:**

- The link may have expired (1-hour TTL). Request a new one.
- The link may have already been used. Recovery nonces are single-use.
- The workspace may have been renamed since the link was generated. The nonce is tied to a `workspaceId`, not a slug — if the slug changed but the workspace ID is the same, the link should still work. If not, request a new link from the current URL.

---

## Case 3: Workspace slug renamed — admin doesn't have new URL

If a super admin renamed the workspace slug, all existing session cookies (`ws_{old_slug}`, `admin_{old_slug}`) are immediately invalidated. Users who navigate to the old URL will get a "workspace not found" error.

**Finding the new slug:**

If you're the Palantir super admin (your email is in `PALANTIR_ADMINS`), you can see all workspaces and their current slugs at `/palantir`.

If you don't have Palantir access, check with whoever initiated the rename — they should have the new URL.

**If the workspace slug is completely unknown:**

Use the Supabase dashboard → Table Editor → `workspaces` table. Find the workspace by its `name` or `id` and read the current `slug` value.

---

## Case 4: Workspace was never claimed

If a workspace was just created via `/generate` but the admin-entry link was lost before anyone claimed it (by entering their email at `/admin-enter/{slug}/{token}`), the workspace has no super admin.

The workspace still exists in Supabase, but `ws:{workspaceId}:cfg:admins` in Redis is either missing or empty.

**Recovery:**

The `admin_entry_token` in the `workspaces` table is the one-time claim token. If you have database access:

1. Open Supabase → Table Editor → `workspaces`
2. Find the workspace row by slug
3. Copy the `admin_entry_token`
4. Navigate to `/{workspace}/admin-enter` and... actually the entry flow expects `GET /admin-enter/{slug}/{token}` which auto-claims. Construct that URL and visit it.

Alternatively: use the Palantir super-admin panel to manually add an admin role for an email address.

---

## Case 5: Palantir super-admin access

The Palantir panel at `/palantir` gives access to all workspaces and can manipulate their Redis config (including admin role lists and limits). Palantir access requires:

- Your email address to be in the `PALANTIR_ADMINS` environment variable (comma-separated list)
- Requesting a magic link at `/palantir/enter`

If you're locked out of Palantir because your email isn't in `PALANTIR_ADMINS`, or the magic link email isn't arriving (same Resend troubleshooting as Case 2 above), the only path is Vercel access to update the `PALANTIR_ADMINS` env var and redeploy.

---

## Workspace deletion

Workspace deletion is not self-serve — it requires a confirmed delete request from the workspace admin, which appears in the Palantir dashboard for a Palantir admin to action. Nothing is deleted automatically. If you need to delete a workspace, either go through the normal in-app delete request flow, or use the Supabase dashboard to delete the workspace row directly (Supabase will cascade-delete rooms, bookings, and members via foreign key constraints).
