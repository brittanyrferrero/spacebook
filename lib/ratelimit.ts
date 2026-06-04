import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

let _redis: Redis | null = null
function redis() {
  if (!_redis) _redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
  return _redis
}

export function ratelimit(requests: number, window: `${number} ${'s'|'m'|'h'}`) {
  return new Ratelimit({ redis: redis(), limiter: Ratelimit.slidingWindow(requests, window) })
}

export function getIP(req: Request): string {
  // On Vercel the rightmost X-Forwarded-For value is injected by infrastructure
  // and cannot be spoofed by the client. Taking the leftmost value ([0]) is
  // the classic bypass: attacker sets X-Forwarded-For: fake-ip to skip rate limits.
  const forwarded = (req as any).headers?.get?.('x-forwarded-for')
  if (forwarded) {
    const ips = forwarded.split(',').map((s: string) => s.trim())
    return ips[ips.length - 1]
  }
  return (req as any).headers?.get?.('x-real-ip') ?? '127.0.0.1'
}
