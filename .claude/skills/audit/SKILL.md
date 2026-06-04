---
name: audit
description: >
  Security audit skill. Run a comprehensive security review of the current codebase,
  checking for vulnerabilities across authentication, authorization, input validation,
  secrets management, injection, XSS, dependency hygiene, and framework-specific risks.
  Use this skill whenever the user asks to audit, review security, check for
  vulnerabilities, run a security scan, or says things like "is this secure?",
  "check the codebase for security issues", "security review", or "run audit".
  Also invoke proactively when an agent is about to commit or deploy and no recent
  audit has been run. Produces a severity-ranked report saved as a logfile, and
  creates GitHub issues for each actionable finding.
---

# Security Audit

You are performing a thorough security audit of the codebase. Work methodically
through each layer below, collecting findings as you go. At the end, produce a
single structured report — don't emit findings piecemeal — then save it to a
logfile and file GitHub issues.

## 1. Orientation

Before scanning, understand the codebase shape:

- Detect the primary language/framework (package.json, requirements.txt, go.mod, etc.)
- Note the entry points: API routes, server functions, CLI entrypoints
- Check for a `.env.example` or similar to understand what secrets exist
- Check for existing security docs (CLAUDE.md, claude-security-guidance.md, SECURITY.md)
- Check if a GitHub remote exists: `gh repo view --json nameWithOwner 2>/dev/null`

## 2. Pattern scan (grep-based)

Run these searches. Pipe through `grep -n` to get line numbers. Collect results — don't stop on first hit.

### Secrets & credentials
```bash
# Hardcoded secrets / tokens
grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.py" \
  -E "(password|secret|token|api_key|apikey|private_key)\s*=\s*['\"][^'\"]{8,}" . \
  --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null

# NEXT_PUBLIC_ vars that look sensitive (baked into client bundles)
grep -rn "NEXT_PUBLIC_.*KEY\|NEXT_PUBLIC_.*SECRET\|NEXT_PUBLIC_.*TOKEN\|NEXT_PUBLIC_.*PASSWORD" \
  --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null

# .env files committed to git
git ls-files | grep -E "^\.env($|\.local|\.production|\.staging)" 2>/dev/null
```

### Injection & unsafe execution
```bash
grep -rn --include="*.ts" --include="*.tsx" --include="*.js" \
  -E "eval\(|new Function\(|child_process\.exec\(|execSync\(" \
  --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null

grep -rn --include="*.ts" --include="*.tsx" --include="*.js" \
  "dangerouslySetInnerHTML\|\.innerHTML\s*=\|insertAdjacentHTML" \
  --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null
```

### TLS / crypto
```bash
grep -rn "rejectUnauthorized\s*:\s*false\|verify\s*=\s*False\|InsecureSkipVerify" \
  --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null
```

### SQL-style injection risks
```bash
grep -rn --include="*.ts" --include="*.tsx" --include="*.js" \
  -E "\.query\(\s*[\`'\"]|\.raw\(\s*[\`'\"]|\.sql\`" \
  --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null
```

## 3. API route authorization audit

For Next.js apps, read every file matching `app/api/**/route.ts` (or `pages/api/**/*.ts`).
For each route, check:

1. **Auth check present?** — Does the handler verify a session cookie, token, or admin flag before acting?
2. **Workspace isolation** — If the route takes a `workspace` param, does it verify the caller has access?
3. **Input validation** — Are types and formats checked before use?
4. **Admin routes** — Routes under `/api/admin/` or `/api/palantir/` — do they require elevated auth?

Look for:
- IDOR: handlers that use `params` values in DB queries without verifying the caller owns that resource
- Missing `if (!session) return 401` guards
- Routes where the only auth is "workspace slug matches a cookie" but the slug can be supplied by the caller

## 4. Supabase / database security (if applicable)

```bash
grep -rn "SUPABASE_SERVICE_ROLE_KEY\|SUPABASE_ANON_KEY\|createClient" lib/supabase/ 2>/dev/null
grep -rn "NEXT_PUBLIC_SUPABASE_ANON_KEY" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules . 2>/dev/null
```

Check:
- Server client uses service role key (not anon key) — anon key without RLS = full table access
- RLS enabled on all tables (can't verify from code — flag for DB dashboard)
- No raw SQL with string interpolation

## 5. Cookie & session security

```bash
grep -rn "cookieStore\." --include="*.ts" --exclude-dir=node_modules . 2>/dev/null | grep "\.set(" | head -20
```

Check: `httpOnly: true`, `secure: true` in production, `sameSite` set, reasonable expiry.

## 6. Dependency vulnerabilities

```bash
npm audit --json 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
vulns = d.get('vulnerabilities', {})
direct_high = {k: v for k,v in vulns.items() if v.get('severity') in ('critical','high') and v.get('isDirect')}
for name, info in direct_high.items():
    advisories = info.get('via', [])
    titles = [a.get('title','') for a in advisories if isinstance(a, dict)]
    print(f\"{info['severity'].upper()} {name}: {'; '.join(titles)}\")
print(f\"Total: {d.get('metadata',{}).get('vulnerabilities',{})}\")
" 2>/dev/null || \
pip audit 2>/dev/null || \
cargo audit 2>/dev/null
```

Only escalate direct dependencies with critical or high severity — indirect tree is noise.

## 7. Secrets in git history

```bash
commit_count=$(git log --all --oneline 2>/dev/null | wc -l | tr -d ' ')
echo "Commits: $commit_count"
if [ "$commit_count" -lt 500 ]; then
  git log --all -p -- "*.env" ".env*" 2>/dev/null | \
    grep -iE "^\+(password|secret|api_key|token)\s*=" | head -20
fi
```

## 8. Environment variable exposure

```bash
# Show keys only, not values
cat .env.example 2>/dev/null | grep -v "^#" | sed 's/=.*/=<redacted>/'

# process.env references in client components (non-NEXT_PUBLIC vars get leaked)
grep -rn "process\.env\." --include="*.tsx" \
  --exclude-dir=node_modules . 2>/dev/null | grep -v "NEXT_PUBLIC\|NODE_ENV" | head -20
```

## 9. Compile the report

After completing all scans, write the full report using this template. Be precise — cite exact
files and line numbers. Don't invent findings. If a grep returned nothing, say so in "Clean".

```
## Security Audit Report
**Project:** [name from package.json or directory]
**Date:** [YYYY-MM-DD]
**Auditor:** Claude (security-audit skill)
**Log:** security-audit-[YYYY-MM-DD].md

### Summary
[2–3 sentences. Total findings by severity. Single most urgent thing.]

### Findings

#### [SEVERITY] [Short title]
**File:** `path/to/file.ts:42`
**Category:** Auth | Injection | XSS | Secrets | Dependencies | Config | IDOR | Other
**Risk:** What an attacker could do
**Detail:** What you found, with a short code snippet if it helps
**Fix:** Concrete remediation — specific enough to act on immediately

[repeat for each finding, ordered CRITICAL → HIGH → MEDIUM → LOW]

### Not checked (requires manual verification)
- [DB dashboard checks, runtime/pen-test items]

### Clean (explicitly verified — no issues found)
- [List patterns you scanned and found clean]
```

Severity definitions:
- **CRITICAL** — exploitable now, high impact (data breach, RCE, full auth bypass)
- **HIGH** — serious, easily exploitable or high impact
- **MEDIUM** — real risk, requires specific conditions
- **LOW** — best-practice gap, defense-in-depth, minor info leak

## 10. Save the logfile

Write the complete report to a file in the project root:

```bash
AUDIT_DATE=$(date +%Y-%m-%d)
LOGFILE="security-audit-${AUDIT_DATE}.md"
# Write report content to $LOGFILE
```

Add a header line to the top of the file:
```
<!-- generated by /audit skill on [date] — do not edit manually -->
```

After writing, confirm the path: `echo "Audit saved to $LOGFILE"`

Add `security-audit-*.md` to `.gitignore` if it isn't already — audit logs shouldn't be committed:
```bash
grep -q "security-audit-\*.md" .gitignore 2>/dev/null || echo "security-audit-*.md" >> .gitignore
```

## 11. Create GitHub issues

After saving the logfile, check whether a GitHub remote is available:

```bash
gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null
```

If a repo is found, create one GitHub issue per **actionable finding** (CRITICAL, HIGH, and MEDIUM severity). Skip LOW findings and "Not checked" items — those don't warrant issues.

For each issue:

```bash
gh issue create \
  --title "[Security] SEVERITY: Short title" \
  --label "security" \
  --body "$(cat <<'BODY'
## Finding

**Severity:** SEVERITY
**Category:** Auth | Injection | XSS | etc.
**File:** `path/to/file.ts:line`

## Risk

What an attacker could do if this is exploited.

## Detail

What was found, with code snippet if relevant.

## Fix

Concrete remediation steps.

---
*Generated by the `/audit` security skill on [date]. Full report: `security-audit-[date].md`*
BODY
)"
```

If the `security` label doesn't exist yet, create it first:
```bash
gh label create security --color "#e11d48" --description "Security vulnerability or concern" 2>/dev/null || true
```

After creating all issues, print a summary:
```
Issues created:
  #123 — [Security] CRITICAL: Next.js outdated (cache poisoning CVEs)
  #124 — [Security] HIGH: Supabase RLS not enabled
  #125 — [Security] MEDIUM: enter-set-cookie grants access without token
```

If no GitHub remote is found (e.g. running locally without git remote configured), skip issue
creation and note: "GitHub issues skipped — no remote detected. Run `gh auth login` and ensure
a remote is configured to enable this."

## Guidance notes

- **Don't emit findings as you go** — collect everything first, then write the report, then save and file issues. One clean pass.
- **Be precise.** Cite exact files and line numbers. Don't round up to directory-level.
- **Don't pad.** Only report what you actually found. Generic "consider adding input validation" without a specific location is not a finding.
- **For `npm audit`**, only escalate direct-dependency high/critical findings. The full indirect tree produces noise.
- **For CRITICAL findings**, call them out at the very top of the Summary before the numbered list.
- **Duplicate issues**: before creating, run `gh issue list --label security --state open --json title` and skip any issue whose title is already present to avoid duplicates on re-runs.
- **Logfile on re-run**: if a logfile for today's date already exists, append a `---` separator and the new report rather than overwriting.
