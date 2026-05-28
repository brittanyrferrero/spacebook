import { type NextRequest, NextResponse } from 'next/server'
import { getWorkspaceBySlug } from '@/lib/workspace'

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const { email } = await req.json().catch(() => ({}))
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const lower = email.trim().toLowerCase()
  const workspace = await getWorkspaceBySlug(params.workspace)
  if (!workspace) return NextResponse.json({ ok: true }) // silently succeed — don't leak workspace existence

  const { getAdminRole } = await import('@/lib/prod-config')
  const role = await getAdminRole(workspace.id, lower)

  if (role) {
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.space-book.net'
    const url = `${origin}/admin-enter/${workspace.slug}/${workspace.admin_entry_token}`
    const { sendAdminRecoveryEmail } = await import('@/lib/email')
    await sendAdminRecoveryEmail({ to: lower, workspace: workspace.name ?? workspace.slug, url })
  }

  // Always return ok — don't reveal whether the email is an admin
  return NextResponse.json({ ok: true })
}
