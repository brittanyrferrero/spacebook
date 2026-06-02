import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

export async function GET(_req: NextRequest, { params }: { params: { workspace: string } }) {
  if (process.env.MOCK_MODE === 'true') {
    const [{ getMembers }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    return NextResponse.json(getMembers(await getSessionStore()))
  }
  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const [{ data: members }, { data: lastBookings }] = await Promise.all([
    supabase.from('members').select('*').eq('workspace_id', workspaceId).order('name'),
    supabase.from('bookings')
      .select('booker_email, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
  ])

  // Most recent booking created_at per email
  const lastUsedMap: Record<string, string> = {}
  for (const b of lastBookings ?? []) {
    const email = b.booker_email.toLowerCase()
    if (!lastUsedMap[email]) lastUsedMap[email] = b.created_at
  }

  const result = (members ?? []).map(m => ({
    ...m,
    last_used: lastUsedMap[m.email.toLowerCase()] ?? null,
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const { name, email } = await req.json()
  if (!name?.trim() || !email?.trim()) return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 })
  if (process.env.MOCK_MODE === 'true') {
    const [{ addMember }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const result = addMember(store, name.trim(), email.trim().toLowerCase())
    if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })
    await saveSessionStore(store)
    return NextResponse.json(result.member, { status: 201 })
  }
  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { getLimits } = await import('@/lib/prod-config')
  const limits = await getLimits(workspaceId)
  if (limits?.max_members != null) {
    const { count } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).then(r => ({ count: r.count ?? 0 }))
    // Allow upsert if member already exists (email match) — only block net-new additions
    const { data: existing } = await supabase.from('members').select('id').eq('workspace_id', workspaceId).ilike('email', email.trim()).maybeSingle()
    if (!existing && count >= limits.max_members) {
      return NextResponse.json({ error: `Member limit reached (${limits.max_members}). Upgrade to add more members.` }, { status: 403 })
    }
  }

  const { data, error } = await supabase.from('members').upsert({ name: name.trim(), email: email.trim().toLowerCase(), workspace_id: workspaceId }, { onConflict: 'email,workspace_id' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
