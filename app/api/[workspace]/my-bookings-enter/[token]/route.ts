import { type NextRequest, NextResponse } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

async function kv() {
  const { Redis } = await import('@upstash/redis')
  return new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
}

export async function GET(req: NextRequest, { params }: { params: { workspace: string; token: string } }) {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  const workspaceUrl = new URL(`/${params.workspace}`, base)

  if (process.env.MOCK_MODE === 'true') return NextResponse.redirect(workspaceUrl)

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return NextResponse.redirect(workspaceUrl)

  const r = await kv()
  const kvKey = `mb:${workspaceId}:${params.token}`
  const email = await r.get<string>(kvKey)
  if (!email) return NextResponse.redirect(workspaceUrl)

  await r.del(kvKey)

  const secure = process.env.NODE_ENV === 'production'
  const res = NextResponse.redirect(workspaceUrl)

  if (!req.cookies.get(`ws_${params.workspace}`)) {
    res.cookies.set(`ws_${params.workspace}`, params.workspace, {
      httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
    })
  }

  res.cookies.set(`mb_${params.workspace}`, email, {
    httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
  })

  return res
}
