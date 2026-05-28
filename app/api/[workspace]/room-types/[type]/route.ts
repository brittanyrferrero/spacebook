import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

export async function DELETE(_: NextRequest, { params }: { params: { workspace: string; type: string } }) {
  const type = decodeURIComponent(params.type)

  if (process.env.MOCK_MODE === 'true') {
    const [{ deleteRoomType }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const ok = deleteRoomType(store, type)
    if (!ok) return Response.json({ error: 'Not found' }, { status: 404 })
    await saveSessionStore(store)
    return Response.json({ ok: true })
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  const { getRoomTypes, setRoomTypes } = await import('@/lib/prod-config')
  const types = await getRoomTypes(workspaceId)
  if (!types.includes(type)) return Response.json({ error: 'Not found' }, { status: 404 })
  await setRoomTypes(workspaceId, types.filter(t => t !== type))
  return Response.json({ ok: true })
}
