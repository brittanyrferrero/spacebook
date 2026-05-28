import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

export async function DELETE(_: NextRequest, { params }: { params: { workspace: string; amenity: string } }) {
  const amenity = decodeURIComponent(params.amenity)

  if (process.env.MOCK_MODE === 'true') {
    const [{ deleteAmenityOption }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const ok = deleteAmenityOption(store, amenity)
    if (!ok) return Response.json({ error: 'Not found' }, { status: 404 })
    await saveSessionStore(store)
    return Response.json({ ok: true })
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  const { getAmenityOptions, setAmenityOptions } = await import('@/lib/prod-config')
  const options = await getAmenityOptions(workspaceId)
  if (!options.includes(amenity)) return Response.json({ error: 'Not found' }, { status: 404 })
  await setAmenityOptions(workspaceId, options.filter(a => a !== amenity))
  return Response.json({ ok: true })
}
