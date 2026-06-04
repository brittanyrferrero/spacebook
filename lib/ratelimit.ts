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
  const forwarded = (req as any).headers?.get?.('x-forwarded-for')
  return (forwarded ? forwarded.split(',')[0] : '127.0.0.1').trim()
}
