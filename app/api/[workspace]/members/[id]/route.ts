import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

export async function PATCH(req: NextRequest, { params }: { params: { workspace: string; id: string } }) {
  const { name, email } = await req.json()
  if (!name?.trim() || !email?.trim())
    return Response.json({ error: 'Name and email are required.' }, { status: 400 })

  if (process.env.MOCK_MODE === 'true') {
    const [{ updateMember }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const result = updateMember(store, params.id, name.trim(), email.trim().toLowerCase())
    if (result.error) return Response.json({ error: result.error }, { status: result.error.includes('not found') ? 404 : 409 })
    await saveSessionStore(store)
    return Response.json(result.member)
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('members')
    .update({ name: name.trim(), email: email.trim().toLowerCase() })
    .eq('id', params.id)
    .eq('workspace_id', workspaceId)
    .select()
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { workspace: string; id: string } }) {
  if (process.env.MOCK_MODE === 'true') {
    const [{ removeMember }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const ok = removeMember(store, params.id)
    if (!ok) return Response.json({ error: 'Member not found.' }, { status: 404 })
    await saveSessionStore(store)
    return Response.json({ ok: true })
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { error } = await supabase.from('members').delete().eq('id', params.id).eq('workspace_id', workspaceId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
