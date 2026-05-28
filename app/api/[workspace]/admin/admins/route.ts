import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getWorkspaceId } from '@/lib/workspace'

async function requireSuperAdmin(workspace: string) {
  if (process.env.MOCK_MODE === 'true') return true
  const cookieStore = await cookies()
  const role = cookieStore.get(`admin_${workspace}`)?.value
  return role === 'super_admin'
}

export async function GET(_req: NextRequest, { params }: { params: { workspace: string } }) {
  if (process.env.MOCK_MODE === 'true') return Response.json({ admins: [], myRole: 'super_admin' })
  const cookieStore = await cookies()
  const myRole = cookieStore.get(`admin_${params.workspace}`)?.value ?? null
  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  const { getAdmins } = await import('@/lib/prod-config')
  return Response.json({ admins: await getAdmins(workspaceId), myRole })
}

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  if (!await requireSuperAdmin(params.workspace)) return Response.json({ error: 'Super admin required.' }, { status: 403 })

  const { email, role } = await req.json()
  if (!email || !['admin', 'super_admin'].includes(role)) {
    return Response.json({ error: 'Invalid input.' }, { status: 400 })
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  const { getAdmins, setAdmins } = await import('@/lib/prod-config')
  const admins = await getAdmins(workspaceId)
  const lower = email.trim().toLowerCase()
  const existing = admins.findIndex(a => a.email.toLowerCase() === lower)
  if (existing >= 0) {
    admins[existing].role = role
  } else {
    admins.push({ email: lower, role })
  }
  await setAdmins(workspaceId, admins)
  return Response.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { workspace: string } }) {
  if (!await requireSuperAdmin(params.workspace)) return Response.json({ error: 'Super admin required.' }, { status: 403 })

  const { email } = await req.json()
  if (!email) return Response.json({ error: 'email required.' }, { status: 400 })

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  const { getAdmins, setAdmins } = await import('@/lib/prod-config')
  const admins = await getAdmins(workspaceId)
  const lower = email.trim().toLowerCase()
  await setAdmins(workspaceId, admins.filter(a => a.email.toLowerCase() !== lower))
  return Response.json({ ok: true })
}
