import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'

async function requireSuperAdmin() {
  const cookieStore = await cookies()
  const role = cookieStore.get('admin_access')?.value
  if (role !== 'super_admin' && process.env.MOCK_MODE !== 'true') return false
  return true
}

export async function GET() {
  const { getAdmins } = await import('@/lib/prod-config')
  return Response.json(await getAdmins())
}

export async function POST(req: NextRequest) {
  if (!await requireSuperAdmin()) return Response.json({ error: 'Super admin required.' }, { status: 403 })

  const { email, role } = await req.json()
  if (!email || !['admin', 'super_admin'].includes(role)) {
    return Response.json({ error: 'Invalid input.' }, { status: 400 })
  }

  const { getAdmins, setAdmins } = await import('@/lib/prod-config')
  const admins = await getAdmins()
  const lower = email.trim().toLowerCase()
  const existing = admins.findIndex(a => a.email.toLowerCase() === lower)
  if (existing >= 0) {
    admins[existing].role = role
  } else {
    admins.push({ email: lower, role })
  }
  await setAdmins(admins)
  return Response.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!await requireSuperAdmin()) return Response.json({ error: 'Super admin required.' }, { status: 403 })

  const { email } = await req.json()
  if (!email) return Response.json({ error: 'email required.' }, { status: 400 })

  const { getAdmins, setAdmins } = await import('@/lib/prod-config')
  const admins = await getAdmins()
  const lower = email.trim().toLowerCase()
  await setAdmins(admins.filter(a => a.email.toLowerCase() !== lower))
  return Response.json({ ok: true })
}
