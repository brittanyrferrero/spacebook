import { type NextRequest } from 'next/server'
import { appUrl } from '@/lib/email'

async function kv() {
  const { Redis } = await import('@upstash/redis')
  return new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
}

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return Response.json({ error: 'Email required.' }, { status: 400 })

  const allowed = (process.env.PALANTIR_ADMINS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  console.log('[palantir] allowed list length:', allowed.length, '| submitted:', email.trim().toLowerCase())
  if (!allowed.includes(email.trim().toLowerCase())) {
    // Don't reveal whether the email is registered
    return Response.json({ ok: true })
  }

  try {
    const token = crypto.randomUUID()
    const r = await kv()
    await r.set(`palantir:token:${token}`, email.trim().toLowerCase(), { ex: 60 * 15 })

    const base = appUrl()
    const url = `${base}/api/palantir/verify/${token}`

    const { sendPalantirMagicLink } = await import('@/lib/email')
    await sendPalantirMagicLink({ to: email.trim(), url })

    console.log('[palantir] magic link sent to', email.trim())
  } catch (err) {
    console.error('[palantir] enter error:', err)
  }

  return Response.json({ ok: true })
}
