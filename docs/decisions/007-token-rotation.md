# ADR-007: admin_entry_token rotation and recovery nonce design
Date: 2026-06-10
Status: Accepted

## Context

Every workspace has an `admin_entry_token` stored in plaintext on the `workspaces` row in Supabase. When a new workspace is created, the creator is redirected to `/admin-enter/{slug}/{token}` — the token in the URL is what grants the claim.

The original design kept this token permanent. This created two problems:

1. **Email history replay.** The claim link is sent or shared via email. If the link is never invalidated, anyone who later gains access to that email (forwarded thread, phishing, data breach) can claim admin access at any time.

2. **Browser history / server logs.** The token appears in the URL, which means it sits in browser history, server access logs, and any proxy logs indefinitely.

## Decision

**Rotate `admin_entry_token` on every successful use.**

When an admin successfully authenticates via the permanent token — whether claiming the workspace for the first time or logging back in — the token is immediately replaced with a new `crypto.randomUUID()`. The old link stops working. Each successful login cycle issues a fresh token for the next time.

**Recovery via short-lived nonces.**

Because the permanent token rotates away after login, "I lost my browser session" can't be solved by digging up the old email. Instead, admins request a recovery link at `/{workspace}/admin/recover`. The system:

1. Generates a UUID nonce via `crypto.randomUUID()`
2. Stores it in Redis (`recovery:nonce:{nonce}` → workspace ID) with a **1-hour TTL**
3. Emails the admin a link containing the nonce: `/admin-enter/{slug}/{nonce}`
4. On use, `verifyAndConsumeRecoveryNonce()` atomically verifies and **deletes** the key — the link is single-use and expires after one hour

Recovery links accept the same `admin-enter` endpoint as permanent tokens; the endpoint checks which kind of token it received and handles both paths.

## Consequences

**Better:** Admin entry links no longer live forever. A phished or forwarded email from months ago cannot be replayed.

**Better:** Recovery links expire in 1 hour and are consumed on first click, preventing replay via email threads or browser history.

**Operational note:** Recovery links expire. If an admin requests a recovery email and doesn't use it within 1 hour, they need to request a new one. This is intentional — an unexpired link sitting in email has the same risk profile as the old permanent token. If recovery is unavailable (e.g. the admin email is also lost), a Palantir super-admin can manually reset access.

**Implementation files:**
- `app/api/[workspace]/admin-enter/route.ts` — rotation logic (lines 54–57 and 73–78)
- `app/api/[workspace]/admin-recover/route.ts` — nonce generation and email dispatch
- `lib/prod-config.ts` — `setRecoveryNonce`, `verifyAndConsumeRecoveryNonce` (1-hour TTL, atomic delete)
