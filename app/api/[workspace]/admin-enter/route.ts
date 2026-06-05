import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getWorkspaceBySlug } from '@/lib/workspace'

export async function GET(_req: NextRequest, { params }: { params: { workspace: string } }) {
  if (process.env.MOCK_MODE === 'true') return Response.json({ unclaimed: true })
  const workspaceId = (await getWorkspaceBySlug(params.workspace))?.id
  if (!workspaceId) return Response.json({ unclaimed: false })
  const { isWorkspaceUnclaimed } = await import('@/lib/prod-config')
  return Response.json({ unclaimed: await isWorkspaceUnclaimed(workspaceId) })
}

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const { email, token } = await req.json()
  if (!email || !token) return NextResponse.json({ error: 'Missing fields.' }, { status: 400 })

  if (process.env.MOCK_MODE === 'true') {
    const cookieStore = await cookies()
    cookieStore.set(`admin_${params.workspace}`, 'super_admin', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
    })
    return NextResponse.json({ role: 'super_admin', claimed: true, entryToken: token })
  }

  const workspace = await getWorkspaceBySlug(params.workspace)
  if (!workspace) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })

  const { isWorkspaceUnclaimed, setAdmins, setWorkspaceToken, getAdminRole, getWorkspaceToken, verifyAndConsumeRecoveryNonce } = await import('@/lib/prod-config')

  // Accept either the permanent admin_entry_token (for initial claims) or a
  // short-lived recovery nonce (consumed on use so replays are rejected).
  const isPermanentToken = token === workspace.admin_entry_token
  const recoveredWorkspaceId = isPermanentToken ? null : await verifyAndConsumeRecoveryNonce(token)
  if (!isPermanentToken && recoveredWorkspaceId !== workspace.id) {
    return NextResponse.json({ error: 'Invalid entry link.' }, { status: 403 })
  }

  const lower = email.trim().toLowerCase()
  const workspaceId = workspace.id

  if (await isWorkspaceUnclaimed(workspaceId)) {
    await setAdmins(workspaceId, [{ email: lower, role: 'super_admin' }])
    const entryToken = crypto.randomUUID()
    await setWorkspaceToken(workspaceId, entryToken)

    // Rotate the permanent token so the original claim link can't be reused
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    await supabase.from('workspaces').update({ admin_entry_token: crypto.randomUUID() }).eq('id', workspaceId)

    const cookieStore = await cookies()
    const secure = process.env.NODE_ENV === 'production'
    cookieStore.set(`admin_${params.workspace}`, 'super_admin', {
      httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
    })
    cookieStore.set(`ws_${params.workspace}`, entryToken, {
      httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
    })
    return NextResponse.json({ role: 'super_admin', claimed: true, entryToken })
  }

  const role = await getAdminRole(workspaceId, lower)
  if (!role) return NextResponse.json({ error: "You don't have admin access." }, { status: 403 })

  // Rotate the permanent token after every successful login so old links expire
  if (isPermanentToken) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    await supabase.from('workspaces').update({ admin_entry_token: crypto.randomUUID() }).eq('id', workspaceId)
  }

  const cookieStore = await cookies()
  const secure = process.env.NODE_ENV === 'production'
  cookieStore.set(`admin_${params.workspace}`, role, {
    httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7,
  })
  const wsToken = await getWorkspaceToken(workspaceId)
  if (wsToken) {
    cookieStore.set(`ws_${params.workspace}`, wsToken, {
      httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
    })
  }
  return NextResponse.json({ role })
}
