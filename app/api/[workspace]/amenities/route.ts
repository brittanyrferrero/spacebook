import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

export async function GET(_req: NextRequest, { params }: { params: { workspace: string } }) {
  if (process.env.MOCK_MODE === 'true') {
    const [{ getAmenityOptions }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    return Response.json(getAmenityOptions(await getSessionStore()))
  }
  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  const { getAmenityOptions } = await import('@/lib/prod-config')
  return Response.json(await getAmenityOptions(workspaceId))
}

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const { amenity } = await req.json()
  if (!amenity?.trim()) return Response.json({ error: 'amenity required' }, { status: 400 })

  if (process.env.MOCK_MODE === 'true') {
    const [{ addAmenityOption }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const result = addAmenityOption(store, amenity.trim())
    if ('error' in result) return Response.json(result, { status: 409 })
    await saveSessionStore(store)
    return Response.json(result, { status: 201 })
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  const { getAmenityOptions, setAmenityOptions } = await import('@/lib/prod-config')
  const options = await getAmenityOptions(workspaceId)
  if (options.includes(amenity.trim())) return Response.json({ error: 'Already exists' }, { status: 409 })
  await setAmenityOptions(workspaceId, [...options, amenity.trim()])
  return Response.json({ amenity: amenity.trim() }, { status: 201 })
}
