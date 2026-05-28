import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

export async function PATCH(req: NextRequest, { params }: { params: { workspace: string; id: string } }) {
  const patch = await req.json()

  if (process.env.MOCK_MODE === 'true') {
    const [{ updateRoom }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const room = updateRoom(store, params.id, patch)
    if (!room) return Response.json({ error: 'Room not found' }, { status: 404 })
    await saveSessionStore(store)
    return Response.json(room)
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data, error } = await supabase.from('rooms').update(patch).eq('id', params.id).eq('workspace_id', workspaceId).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { workspace: string; id: string } }) {
  if (process.env.MOCK_MODE === 'true') {
    const [{ deleteRoom }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const result = deleteRoom(store, params.id)
    if (!result.ok) return Response.json({ error: 'Room not found' }, { status: 404 })
    await saveSessionStore(store)
    return Response.json(result)
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { error } = await supabase.from('rooms').delete().eq('id', params.id).eq('workspace_id', workspaceId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, hasBookings: false })
}
