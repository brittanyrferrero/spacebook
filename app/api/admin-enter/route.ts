import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'

async function isUnclaimed(): Promise<boolean> {
  if (process.env.SUPER_ADMIN_EMAILS?.trim()) return false
  const { getAdmins } = await import('@/lib/prod-config')
  const admins = await getAdmins()
  return admins.length === 0
}

export async function GET() {
  return Response.json({ unclaimed: await isUnclaimed() })
}

export async function POST(req: NextRequest) {
  const { email, token } = await req.json()
  if (!email || !token) return Response.json({ error: 'Missing fields.' }, { status: 400 })

  const adminToken = process.env.ADMIN_ENTRY_TOKEN
  if (!adminToken || token !== adminToken) {
    return Response.json({ error: 'Invalid entry link.' }, { status: 403 })
  }

  const lower = email.trim().toLowerCase()

  // Unclaimed instance — first person claims super admin and generates workspace entry token
  if (await isUnclaimed()) {
    const { setAdmins, setWorkspaceToken } = await import('@/lib/prod-config')
    await setAdmins([{ email: lower, role: 'super_admin' }])
    const entryToken = crypto.randomUUID()
    await setWorkspaceToken(entryToken)
    const cookieStore = await cookies()
    cookieStore.set('admin_access', 'super_admin', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12 })
    cookieStore.set('ws_access', entryToken, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
    return Response.json({ role: 'super_admin', claimed: true, entryToken })
  }

  // Normal flow — check if email is on the admin list
  const { getAdminRole, getWorkspaceToken } = await import('@/lib/prod-config')
  const role = await getAdminRole(lower)
  if (!role) return Response.json({ error: 'You don\'t have admin access.' }, { status: 403 })

  const cookieStore = await cookies()
  cookieStore.set('admin_access', role, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12 })
  // Also grant workspace access so admins can hit all API routes
  const wsToken = await getWorkspaceToken()
  if (wsToken) {
    cookieStore.set('ws_access', wsToken, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
  }
  return Response.json({ role })
}
