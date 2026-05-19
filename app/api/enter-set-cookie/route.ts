import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  const { getWorkspaceToken } = await import('@/lib/prod-config')
  const expected = await getWorkspaceToken()
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set('ws_access', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })
  return res
}
