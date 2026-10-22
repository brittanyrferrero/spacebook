import { type NextRequest, NextResponse } from 'next/server'
import { getWorkspaceBySlug } from '@/lib/workspace'
import { appUrl } from '@/lib/email'

export async function POST(req: NextRequest, props: { params: Promise<{ workspace: string }> }) {
  const params = await props.params;
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
    const { setRecoveryNonce } = await import('@/lib/prod-config')
    const nonce = crypto.randomUUID()
    await setRecoveryNonce(workspace.id, nonce, lower)
    const origin = appUrl()
    const url = `${origin}/admin-enter/${workspace.slug}/${nonce}`
    const { sendAdminRecoveryEmail } = await import('@/lib/email')
    await sendAdminRecoveryEmail({ to: lower, workspace: workspace.name ?? workspace.slug, url })
  }

  // Always return ok — don't reveal whether the email is an admin
  return NextResponse.json({ ok: true })
}
