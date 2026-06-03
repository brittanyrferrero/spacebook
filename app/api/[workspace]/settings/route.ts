import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

const DEFAULT_VISIBILITY = { showTitle: false, showOrganizer: false, allowEditOthers: false }
const DEFAULT_DISPLAY_HOURS = { start: 8, end: 20 }
const DEFAULT_BOOKING_HOURS = { start: 6, end: 22 }

export async function GET(_req: NextRequest, { params }: { params: { workspace: string } }) {
  if (process.env.MOCK_MODE === 'true') {
    const { getSessionStore } = await import('@/lib/mock/store')
    const store = await getSessionStore()
    return Response.json({
      bookingHours: store.bookingHours ?? DEFAULT_BOOKING_HOURS,
      displayHours: store.displayHours ?? DEFAULT_DISPLAY_HOURS,
      bookingVisibility: store.bookingVisibility ?? DEFAULT_VISIBILITY,
      countWeekends: store.countWeekends ?? false,
    })
  }
  const { getWorkspaceBySlug } = await import('@/lib/workspace')
  const workspace = await getWorkspaceBySlug(params.workspace)
  if (!workspace) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  const workspaceId = workspace.id
  const { getBookingHours, getDisplayHours, getBookingVisibility, getCountWeekends, getLimits } = await import('@/lib/prod-config')
  const [bookingHours, displayHours, bookingVisibility, countWeekends, limits] = await Promise.all([
    getBookingHours(workspaceId),
    getDisplayHours(workspaceId),
    getBookingVisibility(workspaceId),
    getCountWeekends(workspaceId),
    getLimits(workspaceId),
  ])

  let trial_usage = null
  if (limits?.is_trial) {
    const { createClient: mkClient } = await import('@/lib/supabase/server')
    const sb = await mkClient()
    const [{ count: memberCount }, { count: bookingCount }] = await Promise.all([
      sb.from('members').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).then(r => ({ count: r.count ?? 0 })),
      sb.from('bookings').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).then(r => ({ count: r.count ?? 0 })),
    ])
    trial_usage = { members: memberCount, bookings: bookingCount }
  }

  return Response.json({ bookingHours, displayHours, bookingVisibility, countWeekends, adminEntryToken: workspace.admin_entry_token, workspaceName: workspace.name, limits, trial_usage })
}

export async function PATCH(req: NextRequest, { params }: { params: { workspace: string } }) {
  const body = await req.json()

  if (body.bookingHours !== undefined) {
    const { start, end } = body.bookingHours ?? {}
    if (typeof start !== 'number' || typeof end !== 'number' || end - start < 2 || start < 0 || end > 24) {
      return Response.json({ error: 'Invalid booking hours.' }, { status: 400 })
    }
    if (process.env.MOCK_MODE === 'true') {
      const { getSessionStore, saveSessionStore } = await import('@/lib/mock/store')
      const store = await getSessionStore()
      store.bookingHours = { start, end }
      await saveSessionStore(store)
      return Response.json({ bookingHours: store.bookingHours })
    }
    const workspaceId = await getWorkspaceId(params.workspace)
    if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
    const { setBookingHours } = await import('@/lib/prod-config')
    await setBookingHours(workspaceId, { start, end })
    return Response.json({ bookingHours: { start, end } })
  }

  if (body.displayHours !== undefined) {
    const { start, end } = body.displayHours ?? {}
    if (typeof start !== 'number' || typeof end !== 'number' || end - start < 2 || start < 0 || end > 24) {
      return Response.json({ error: 'Invalid display hours.' }, { status: 400 })
    }
    if (process.env.MOCK_MODE === 'true') {
      const { getSessionStore, saveSessionStore } = await import('@/lib/mock/store')
      const store = await getSessionStore()
      store.displayHours = { start, end }
      await saveSessionStore(store)
      return Response.json({ displayHours: store.displayHours })
    }
    const workspaceId = await getWorkspaceId(params.workspace)
    if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
    const { setDisplayHours } = await import('@/lib/prod-config')
    await setDisplayHours(workspaceId, { start, end })
    return Response.json({ displayHours: { start, end } })
  }

  if (body.bookingVisibility !== undefined) {
    const { showTitle, showOrganizer, allowEditOthers } = body.bookingVisibility ?? {}
    if (typeof showTitle !== 'boolean' || typeof showOrganizer !== 'boolean' || typeof allowEditOthers !== 'boolean') {
      return Response.json({ error: 'Invalid visibility settings.' }, { status: 400 })
    }
    if (process.env.MOCK_MODE === 'true') {
      const { getSessionStore, saveSessionStore } = await import('@/lib/mock/store')
      const store = await getSessionStore()
      store.bookingVisibility = { showTitle, showOrganizer, allowEditOthers }
      await saveSessionStore(store)
      return Response.json({ bookingVisibility: store.bookingVisibility })
    }
    const workspaceId = await getWorkspaceId(params.workspace)
    if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
    const { setBookingVisibility } = await import('@/lib/prod-config')
    await setBookingVisibility(workspaceId, { showTitle, showOrganizer, allowEditOthers })
    return Response.json({ bookingVisibility: { showTitle, showOrganizer, allowEditOthers } })
  }

  if (body.countWeekends !== undefined) {
    if (typeof body.countWeekends !== 'boolean') {
      return Response.json({ error: 'Invalid value.' }, { status: 400 })
    }
    if (process.env.MOCK_MODE === 'true') {
      const { getSessionStore, saveSessionStore } = await import('@/lib/mock/store')
      const store = await getSessionStore()
      store.countWeekends = body.countWeekends
      await saveSessionStore(store)
      return Response.json({ countWeekends: store.countWeekends })
    }
    const workspaceId = await getWorkspaceId(params.workspace)
    if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
    const { setCountWeekends } = await import('@/lib/prod-config')
    await setCountWeekends(workspaceId, body.countWeekends)
    return Response.json({ countWeekends: body.countWeekends })
  }

  if (body.workspaceName !== undefined) {
    const name = typeof body.workspaceName === 'string' ? body.workspaceName.trim() : null
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const workspaceId = await getWorkspaceId(params.workspace)
    if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
    await supabase.from('workspaces').update({ name: name || null }).eq('id', workspaceId)
    return Response.json({ workspaceName: name || null })
  }

  return Response.json({ error: 'Nothing to update.' }, { status: 400 })
}
