import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ ok: false }, { status: 401 })
  const { getWorkspaceToken } = await import('@/lib/prod-config')
  const expected = await getWorkspaceToken()
  return (expected && token === expected)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false }, { status: 401 })
}
