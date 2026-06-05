# ADR-001: Slug-as-secret workspace authentication model
Date: 2026-06-05
Status: Accepted

## Context

Most multi-tenant SaaS apps require users to create an account with an email and password before they can do anything. For a room booking tool used by small, trusted teams, that barrier is friction with no security payoff — the people booking rooms are already inside the building.

The design goals were:

1. Zero sign-up. A team member should be able to book a room by following a link someone sent them in Slack.
2. No passwords for end users to forget or IT teams to manage.
3. Revocable access that doesn't require per-user account management.
4. Admin access still guarded by a real credential.

## Decision

Access to a workspace is granted by knowing its URL slug. Navigating to `/{slug}` and entering the slug (to prove intent) sets a `ws_{slug}` session cookie. Anyone with that cookie can book rooms. No account creation required.

The slug is the secret. It behaves like a shared password — access is all-or-nothing for everyone who knows it.

Access revocation works by renaming the slug (Settings → Rename workspace URL). This immediately invalidates all existing `ws_{slug}` and `admin_{slug}` cookies. Every user needs the new link. Every kiosk tablet needs reconfiguring. It is deliberately disruptive — it's the equivalent of changing an office lock.

Admin access is layered on top: visiting `/{slug}/admin` requires the global `ADMIN_PASSWORD`, which issues an `admin_{slug}` cookie valid for 7 days. The admin password is set at the deployment level, not per workspace, and is shared among all workspaces on the instance. Admin auth tokens are rotated after each use to limit replay window (PR #73).

## Consequences

**What got better:**
- No user management overhead. Teams of 10–100 people can use the product immediately without any setup beyond sharing a link.
- No forgotten passwords, no account lockouts.
- Revoking access for a former employee or a compromised URL is a single rename operation that requires no knowledge of which individuals to remove.

**What got worse / constraints to know:**
- There is no per-user identity in the auth layer. The product tracks bookings by email (typed on the booking form), not by a verified identity. An end user can type any email; there's no guarantee it matches who's actually in the building.
- If the slug leaks (e.g. in a screenshot), all access must be revoked via rename. There's no way to invalidate access for just one person without changing the credential for everyone.
- Access revocation is all-or-nothing and disruptive. This is a feature — it forces the decision to be deliberate — but teams need to understand the cost before initiating a rename.

**Security model:**
This is "security by obscurity" in the classic sense. The system is not trying to prevent a determined attacker who already knows the slug; it's trying to prevent casual access by people who weren't invited. The threat model is "someone forwarded the wrong link," not "a hostile actor is targeting us."

If a workspace requires stronger access controls (e.g. the booking data is sensitive, or the team is large enough that controlling link distribution is impractical), the right answer is to revisit this model — not patch around it. A membership-based auth model with verified email codes would be the natural next step.

**Future state:**
The `members` table exists and stores email → workspace associations, but it plays no part in access control today — it's used only for autocomplete on the booking form. If per-user auth is added later, the member list is the natural foundation for it.
