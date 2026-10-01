import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { readPalantirSession } from '@/lib/auth-cookies'

async function requirePalantir() {
  const cookieStore = await cookies()
  return readPalantirSession(cookieStore)
}

async function kv() {
  const { Redis } = await import('@upstash/redis')
  return new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
}

export async function GET() {
  if (!await requirePalantir()) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const r = await kv()
  const keys = await r.keys('delete_request:pending:*')
  if (!keys.length) return Response.json([])

  const values = await Promise.all(keys.map(k => r.get(k)))
  const requests = values
    .map(v => {
      try { return typeof v === 'string' ? JSON.parse(v) : v } catch { return null }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(a.confirmedAt).getTime() - new Date(b.confirmedAt).getTime())

  return Response.json(requests)
}

export async function DELETE(req: NextRequest) {
  if (!await requirePalantir()) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { workspaceId } = await req.json()
  if (!workspaceId) return Response.json({ error: 'workspaceId required.' }, { status: 400 })

  const r = await kv()
  await r.del(`delete_request:pending:${workspaceId}`)
  return Response.json({ ok: true })
}
