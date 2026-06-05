# Runbook: Rate limits hit by legitimate users

**Symptom:** Users report getting errors when trying to book rooms, access the admin panel, or receive "too many requests" responses. HTTP 429 responses in Vercel logs.

---

## Which endpoints are rate limited

All rate limits use a sliding window algorithm (Upstash Ratelimit). The window resets continuously, not at a fixed clock boundary.

| Endpoint | Limit | Window | Who it protects |
|---|---|---|---|
| `POST /api/{workspace}/bookings` | 20 requests | 1 minute | Booking creation |
| `POST /api/workspaces` | 5 requests | 1 hour | Workspace creation |
| `POST /api/{workspace}/admin-enter` | 10 requests | 15 minutes | Admin brute force |
| `POST /api/{workspace}/my-bookings-verify` | 5 requests | 10 minutes | Email magic link auth |
| `POST /api/notify` | 5 requests | 1 hour | Notification emails |

Rate limits are keyed by IP address — each unique IP gets its own counter.

The rate limiting code lives in `lib/ratelimit.ts`. Each endpoint instantiates its own limiter with the configured values.

---

## Rate limiting happens after the mock mode check

Rate limiting is only active in production (non-mock mode). If `MOCK_MODE=true`, all rate limit checks are bypassed. This means local development is never rate limited.

---

## Diagnosing a legitimate user being blocked

### Is it actually a rate limit?

Check Vercel logs for the affected endpoint. A rate-limited request returns HTTP 429 with a JSON body like `{ "error": "Too many requests" }`. If you don't see 429s in the logs, the problem may be something else (auth, missing data, etc.).

### Is it a shared IP situation?

The most common cause of legitimate users hitting rate limits is a **shared IP address**. If multiple users in the same office are going through the same NAT gateway or corporate proxy, all their requests count against the same IP counter.

Example: an office of 30 people tries to book rooms simultaneously using a single external IP. The `POST /api/{workspace}/bookings` limit of 20 requests/minute is hit within seconds.

You can check whether requests are coming from a single IP in Vercel's log filtering.

### Is the X-Forwarded-For header being read correctly?

On Vercel, the infrastructure appends the actual client IP as the **rightmost** value in `X-Forwarded-For`. An attacker can set arbitrary values in the leftmost positions, so the app reads the rightmost value:

```typescript
// lib/ratelimit.ts
const ips = forwarded.split(',').map(s => s.trim())
return ips[ips.length - 1]  // rightmost = Vercel-injected, trustworthy
```

If you're seeing a single IP dominating the logs that looks like an internal IP (e.g. `127.0.0.1`, `10.x.x.x`, or a Vercel edge IP), the rightmost X-Forwarded-For may not be the real client IP in your specific proxy configuration. This would cause all users to share one counter and hit limits immediately.

To check: look at what `x-forwarded-for` headers look like in Vercel request logs for a known user. Compare to what `getIP()` would extract.

---

## Adjusting rate limits

The limits are defined inline at each endpoint. To change them, find the `ratelimit()` call in the relevant route file and update the values.

The `ratelimit(requests, window)` function signature:
- `requests`: number of requests allowed in the window
- `window`: `"${number} ${'s'|'m'|'h'}"` — e.g. `"20 m"` means 20 per minute, `"5 h"` means 5 per hour

**Bookings rate limit** (`app/api/[workspace]/bookings/route.ts`):
```typescript
const rl = ratelimit(20, '1 m')
```

**Workspace creation rate limit** (`app/api/workspaces/route.ts`):
```typescript
const rl = ratelimit(5, '1 h')
```

**Admin-enter rate limit** (`app/api/[workspace]/admin-enter/route.ts`):
```typescript
const rl = ratelimit(10, '15 m')
```

**My-bookings-verify rate limit** (`app/api/[workspace]/my-bookings-verify/route.ts`):
```typescript
const rl = ratelimit(5, '10 m')
```

**Notify rate limit** (`app/api/notify/route.ts`):
```typescript
const rl = ratelimit(5, '1 h')
```

After changing a limit, deploy the change. The new limit takes effect for new requests immediately; existing rate limit counters in Redis will expire according to the old window and be replaced by new counters under the new key.

---

## Clearing a specific IP's rate limit counter

If a legitimate user is stuck and you need to unblock them immediately, you can delete their rate limit counter from Redis.

The Upstash Ratelimit key format is `{identifier}:{window_start}`. You can find the key in the Upstash console by searching for the IP address. Delete the relevant key and the counter resets.

Alternatively, wait for the window to expire. The longest window is 1 hour (workspace creation and notify), so in the worst case a user is unblocked within the hour.

---

## When rate limits indicate actual abuse

If you see 429s in logs from an IP you don't recognise making hundreds of requests in quick succession, that's the rate limiting working as intended. No action required unless you want to add the IP to a block list (which would require Vercel Firewall configuration).

The admin-enter endpoint is the most sensitive — 10 requests per 15 minutes per IP is tight enough to prevent automated brute-force of the `ADMIN_PASSWORD`, while allowing a legitimate admin who mistyped their password several times to retry after 15 minutes.
