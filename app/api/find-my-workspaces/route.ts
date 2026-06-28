import { type NextRequest, NextResponse } from 'next/server'
import { isValidEmail, appUrl, sendFindMyWorkspacesEmail } from '@/lib/email'
import { ratelimit, getIP } from '@/lib/ratelimit'
import { getAdmins, setRecoveryNonce } from '@/lib/prod-config'
import { createClient } from '@/lib/supabase/server'

const rl = ratelimit(3, '15 m')

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Valid email required.' }, { status: 400 })
  }

  const { success } = await rl.limit(getIP(req))
  if (!success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  const supabase = await createClient()

  // Fetch all workspaces + member rows for this email in parallel
  const [{ data: allWorkspaces }, { data: memberRows }] = await Promise.all([
    supabase.from('workspaces').select('id, name, slug'),
    supabase.from('members').select('workspace_id').eq('email', email),
  ])

  if (!allWorkspaces?.length) {
    await sendFindMyWorkspacesEmail({ to: email, workspaces: [] })
    return NextResponse.json({ ok: true })
  }

  const memberSet = new Set((memberRows ?? []).map(r => r.workspace_id))

  // Check admin lists in parallel for all workspaces
  const adminLists = await Promise.all(allWorkspaces.map(ws => getAdmins(ws.id)))

  // Build union of member + admin workspaces
  const matched: { id: string; name: string | null; slug: string; role: string | null }[] = []

  for (let i = 0; i < allWorkspaces.length; i++) {
    const ws = allWorkspaces[i]
    const adminEntry = adminLists[i].find(a => a.email.toLowerCase() === email)
    if (adminEntry || memberSet.has(ws.id)) {
      matched.push({ id: ws.id, name: ws.name, slug: ws.slug, role: adminEntry?.role ?? null })
    }
  }

  // Generate recovery nonces for admin workspaces, build final list
  const origin = appUrl()
  const workspaces = await Promise.all(
    matched.map(async ws => {
      let adminUrl: string | undefined
      if (ws.role) {
        const nonce = crypto.randomUUID()
        await setRecoveryNonce(ws.id, nonce, email)
        adminUrl = `${origin}/admin-enter/${ws.slug}/${nonce}`
      }
      return {
        name: ws.name ?? ws.slug,
        slug: ws.slug,
        role: ws.role,
        workspaceUrl: `${origin}/${ws.slug}`,
        adminUrl,
      }
    })
  )

  await sendFindMyWorkspacesEmail({ to: email, workspaces })
  return NextResponse.json({ ok: true })
}
