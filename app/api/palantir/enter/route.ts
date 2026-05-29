import { type NextRequest } from 'next/server'

async function kv() {
  const { Redis } = await import('@upstash/redis')
  return new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
}

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return Response.json({ error: 'Email required.' }, { status: 400 })

  const allowed = (process.env.PALANTIR_ADMINS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  if (!allowed.includes(email.trim().toLowerCase())) {
    // Don't reveal whether the email is registered
    return Response.json({ ok: true })
  }

  const token = crypto.randomUUID()
  const r = await kv()
  await r.set(`palantir:token:${token}`, email.trim().toLowerCase(), { ex: 60 * 15 })

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  const url = `${base}/api/palantir/verify/${token}`

  const { sendPalantirMagicLink } = await import('@/lib/email')
  await sendPalantirMagicLink({ to: email.trim(), url })

  return Response.json({ ok: true })
}
