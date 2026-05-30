import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest, { params }: { params: { workspace: string } }) {
  const roomId = req.nextUrl.searchParams.get('room')
  const token  = req.nextUrl.searchParams.get('t')

  if (!roomId || !token) {
    return NextResponse.redirect(new URL(`/enter/${params.workspace}`, req.url))
  }

  if (process.env.MOCK_MODE === 'true') {
    const { getSessionStore } = await import('@/lib/mock/store')
    const store = await getSessionStore()
    const room = store.rooms.find(r => r.id === roomId)
    if (!room || room.tablet_token !== token) {
      return NextResponse.redirect(new URL(`/enter/${params.workspace}`, req.url))
    }
    const cookieStore = await cookies()
    cookieStore.set(`ws_${params.workspace}`, 'demo', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', path: '/',
    })
    return NextResponse.redirect(new URL(`/${params.workspace}/room/${roomId}`, req.url))
  }

  const { getWorkspaceBySlug } = await import('@/lib/workspace')
  const workspace = await getWorkspaceBySlug(params.workspace)
  if (!workspace) return NextResponse.redirect(new URL(`/enter/${params.workspace}`, req.url))

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: room } = await supabase
    .from('rooms')
    .select('id, tablet_token')
    .eq('id', roomId)
    .eq('workspace_id', workspace.id)
    .single()

  if (!room || room.tablet_token !== token) {
    return NextResponse.redirect(new URL(`/enter/${params.workspace}`, req.url))
  }

  const { getWorkspaceToken } = await import('@/lib/prod-config')
  const wsToken = await getWorkspaceToken(workspace.id)

  const cookieStore = await cookies()
  const secure = process.env.NODE_ENV === 'production'
  cookieStore.set(`ws_${params.workspace}`, wsToken ?? token, {
    httpOnly: true, secure, sameSite: 'lax', path: '/',
    maxAge: 60 * 60 * 24 * 365 * 10,
  })

  return NextResponse.redirect(new URL(`/${params.workspace}/room/${roomId}`, req.url))
}
