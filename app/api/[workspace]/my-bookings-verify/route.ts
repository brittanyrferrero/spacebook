import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

async function kv() {
  const { Redis } = await import('@upstash/redis')
  return new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
}

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const { email } = await req.json().catch(() => ({}))
  if (!email) return Response.json({ error: 'Email required.' }, { status: 400 })

  if (process.env.MOCK_MODE === 'true') return Response.json({ ok: true })

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ ok: true }) // don't reveal non-existence

  try {
    const token = crypto.randomUUID()
    const r = await kv()
    await r.set(`mb:${workspaceId}:${token}`, email.trim().toLowerCase(), { ex: 60 * 60 * 24 * 7 })

    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
    const url = `${base}/api/${params.workspace}/my-bookings-enter/${token}`

    const { sendMyBookingsMagicLink } = await import('@/lib/email')
    await sendMyBookingsMagicLink({ to: email.trim(), url, workspace: params.workspace })
  } catch (err) {
    console.error('[my-bookings-verify] error:', err)
  }

  return Response.json({ ok: true })
}
