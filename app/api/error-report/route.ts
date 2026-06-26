import { Resend } from 'resend'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const ALERT_TO = 'brittany@intelligence.org'
const FROM = process.env.EMAIL_FROM ?? 'spacebook <noreply@spacebook.app>'

export async function POST(req: NextRequest) {
  const key = process.env.RESEND_API_KEY
  if (!key) return Response.json({ ok: false }, { status: 500 })

  const { message, url } = await req.json()

  const resend = new Resend(key)
  await resend.emails.send({
    from: FROM,
    to: ALERT_TO,
    subject: 'spacebook app error',
    html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">App error alert</div>

  <p style="font-size:14px;color:#374151">
    A client-side error triggered the error page. The app will reload automatically within 30 seconds.
  </p>

  <div style="background:#FEF2F2;border-radius:8px;padding:14px 16px;margin:20px 0;font-size:13px;color:#374151">
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">URL</span> &nbsp; ${url ?? 'unknown'}</div>
    <div style="word-break:break-all"><span style="color:#9CA3AF">Error</span> &nbsp; ${message ?? 'unknown'}</div>
  </div>

  <p style="font-size:12px;color:#9CA3AF">
    If the tablet keeps crashing after reloading, there may be a bug that needs fixing.
  </p>
</div>`,
  })

  return Response.json({ ok: true })
}
