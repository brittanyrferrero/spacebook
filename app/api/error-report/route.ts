import { Resend } from 'resend'
import { NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export const dynamic = 'force-dynamic'

const FROM = process.env.EMAIL_FROM ?? 'spacebook <noreply@spacebook.app>'

const esc = (s: unknown) =>
  String(s ?? 'unknown')
    .slice(0, 500)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

let ratelimit: Ratelimit | null = null
function getRatelimit() {
  if (!ratelimit && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(5, '1 h'),
      prefix: 'sb:error-report',
    })
  }
  return ratelimit
}

export async function POST(req: NextRequest) {
  const key = process.env.RESEND_API_KEY
  const alertTo = process.env.ERROR_ALERT_TO
  if (!key || !alertTo) return Response.json({ ok: false }, { status: 500 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const rl = getRatelimit()
  if (rl) {
    const { success } = await rl.limit(ip)
    if (!success) return Response.json({ ok: false }, { status: 429 })
  }

  const body = await req.json()
  const safeUrl = esc(body.url)
  const safeMessage = esc(body.message)

  const resend = new Resend(key)
  await resend.emails.send({
    from: FROM,
    to: alertTo,
    subject: 'spacebook app error',
    html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">App error alert</div>

  <p style="font-size:14px;color:#374151">
    A client-side error triggered the error page. The app will reload automatically within 30 seconds.
  </p>

  <div style="background:#FEF2F2;border-radius:8px;padding:14px 16px;margin:20px 0;font-size:13px;color:#374151">
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">URL</span> &nbsp; ${safeUrl}</div>
    <div style="word-break:break-all"><span style="color:#9CA3AF">Error</span> &nbsp; ${safeMessage}</div>
  </div>

  <p style="font-size:12px;color:#9CA3AF">
    If the tablet keeps crashing after reloading, there may be a bug that needs fixing.
  </p>
</div>`,
  })

  return Response.json({ ok: true })
}
