import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'
import { isValidTimeZone } from '@/lib/time-zone'

// Fills in the workspace time zone from the first browser (tablet, booking page
// or admin) that opens the workspace, so emails show local times without anyone
// having to set it. Only ever sets an empty value; changing it needs an admin
// (PATCH /settings { timeZone }).
export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const { timeZone } = await req.json().catch(() => ({}))
  if (!isValidTimeZone(timeZone)) return Response.json({ error: 'Invalid time zone.' }, { status: 400 })

  if (process.env.MOCK_MODE === 'true') {
    const { getSessionStore, saveSessionStore } = await import('@/lib/mock/store')
    const store = await getSessionStore()
    if (!store.timeZone) { store.timeZone = timeZone; await saveSessionStore(store) }
    return Response.json({ timeZone: store.timeZone })
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  const { setTimeZoneIfUnset, getTimeZone } = await import('@/lib/prod-config')
  await setTimeZoneIfUnset(workspaceId, timeZone)
  return Response.json({ timeZone: await getTimeZone(workspaceId) })
}
