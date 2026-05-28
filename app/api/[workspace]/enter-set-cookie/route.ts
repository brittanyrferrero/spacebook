import { type NextRequest, NextResponse } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

export async function GET(req: NextRequest, { params }: { params: { workspace: string } }) {
  const token = req.nextUrl.searchParams.get('token')

  if (process.env.MOCK_MODE === 'true') {
    const res = NextResponse.json({ ok: true })
    res.cookies.set(`ws_${params.workspace}`, params.workspace, {
      httpOnly: true, secure: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, path: '/',
    })
    return res
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  // If a legacy UUID token was passed, validate it
  if (token) {
    const { getWorkspaceToken } = await import('@/lib/prod-config')
    const expected = await getWorkspaceToken(workspaceId)
    if (!expected || token !== expected) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }
  }

  // Workspace exists — grant access (slug is the shared secret)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(`ws_${params.workspace}`, params.workspace, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })
  return res
}
