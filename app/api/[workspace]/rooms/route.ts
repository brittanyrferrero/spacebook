import { type NextRequest } from 'next/server'
import { getAllRooms, getRooms } from '@/lib/data'
import { getWorkspaceId } from '@/lib/workspace'
import { readAdminRole } from '@/lib/auth-cookies'

export async function GET(req: NextRequest, { params }: { params: { workspace: string } }) {
  const all = req.nextUrl.searchParams.get('all') === '1'
  if (process.env.MOCK_MODE === 'true') {
    const [{ getRooms: mockGet, getAllRooms: mockAll }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    return Response.json(all ? mockAll(store) : mockGet(store))
  }
  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  return Response.json(all ? await getAllRooms(workspaceId) : await getRooms(workspaceId))
}

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const data = await req.json()
  if (!data.name || !data.capacity) return Response.json({ error: 'name and capacity required' }, { status: 400 })
  const adminRole = await readAdminRole(req.cookies, params.workspace)
  if (!adminRole) return Response.json({ error: 'Admin required.' }, { status: 403 })
  if (process.env.MOCK_MODE === 'true') {
    const [{ createRoom }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const room = createRoom(store, data)
    await saveSessionStore(store)
    return Response.json(room, { status: 201 })
  }
  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { getLimits } = await import('@/lib/prod-config')
  const limits = await getLimits(workspaceId)
  if (limits?.max_rooms != null) {
    const { count } = await supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('is_active', true).then(r => ({ count: r.count ?? 0 }))
    if (count >= limits.max_rooms) {
      return Response.json({ error: `Room limit reached (${limits.max_rooms}). Upgrade to add more rooms.` }, { status: 403 })
    }
  }

  const { data: room, error } = await supabase.from('rooms').insert({ ...data, workspace_id: workspaceId }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(room, { status: 201 })
}
