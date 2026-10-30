import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

export async function GET(_req: NextRequest, props: { params: Promise<{ workspace: string }> }) {
  const params = await props.params;
  if (process.env.MOCK_MODE === 'true') {
    const [{ getRoomTypes }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    return Response.json(getRoomTypes(await getSessionStore()))
  }
  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  const { getRoomTypes } = await import('@/lib/prod-config')
  return Response.json(await getRoomTypes(workspaceId))
}

export async function POST(req: NextRequest, props: { params: Promise<{ workspace: string }> }) {
  const params = await props.params;
  const { type } = await req.json()
  if (!type?.trim()) return Response.json({ error: 'type required' }, { status: 400 })
  const adminRole = req.cookies.get(`admin_${params.workspace}`)?.value
  if (!adminRole) return Response.json({ error: 'Admin required.' }, { status: 403 })
  if (process.env.MOCK_MODE === 'true') {
    const [{ addRoomType }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const result = addRoomType(store, type.trim())
    if ('error' in result) return Response.json(result, { status: 409 })
    await saveSessionStore(store)
    return Response.json(result, { status: 201 })
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  const { getRoomTypes, setRoomTypes } = await import('@/lib/prod-config')
  const types = await getRoomTypes(workspaceId)
  if (types.includes(type.trim())) return Response.json({ error: 'Already exists' }, { status: 409 })
  await setRoomTypes(workspaceId, [...types, type.trim()])
  return Response.json({ type: type.trim() }, { status: 201 })
}
