import { type NextRequest } from 'next/server'
import { subDays, format } from 'date-fns'
import { getWorkspaceId } from '@/lib/workspace'

export async function GET(req: NextRequest, props: { params: Promise<{ workspace: string }> }) {
  const params = await props.params;
  const { searchParams } = req.nextUrl
  const to = searchParams.get('to') ?? format(new Date(), 'yyyy-MM-dd')
  const from = searchParams.get('from') ?? format(subDays(new Date(), 29), 'yyyy-MM-dd')
  const roomId = searchParams.get('room_id') ?? undefined
  const roomType = searchParams.get('room_type') ?? undefined
  const tzOffset = Number(searchParams.get('tz') ?? '0')

  if (process.env.MOCK_MODE === 'true') {
    const [{ getAdminStats }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    store.tzOffset = tzOffset
    return Response.json(getAdminStats(store, from, to, roomId, roomType))
  }

  const adminRole = req.cookies.get(`admin_${params.workspace}`)?.value
  if (!adminRole) return Response.json({ error: 'Admin required.' }, { status: 403 })

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const [roomsRes, bookingsRes, blocksRes, displayHoursRes, bookingHoursRes, countWeekendsRes] = await Promise.all([
    supabase.from('rooms').select('*').eq('workspace_id', workspaceId).order('display_order'),
    supabase.from('bookings').select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_block', false)
      .gte('start_time', `${from}T00:00:00Z`)
      .lte('start_time', `${to}T23:59:59Z`)
      .is('cancelled_at', null),
    supabase.from('bookings').select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_block', true)
      .gte('start_time', `${from}T00:00:00Z`)
      .lte('start_time', `${to}T23:59:59Z`)
      .is('cancelled_at', null),
    import('@/lib/prod-config').then(m => m.getDisplayHours(workspaceId)),
    import('@/lib/prod-config').then(m => m.getBookingHours(workspaceId)),
    import('@/lib/prod-config').then(m => m.getCountWeekends(workspaceId)),
  ])

  const { getAdminStats } = await import('@/lib/mock/api')
  const { getAmenityOptions, getRoomTypes } = await import('@/lib/prod-config')
  const [amenityOptions, roomTypes] = await Promise.all([
    getAmenityOptions(workspaceId),
    getRoomTypes(workspaceId),
  ])

  const store = {
    rooms: (roomsRes.data ?? []).map((r: any) => ({ ...r, gcal_connected: false })),
    bookings: [...(bookingsRes.data ?? []), ...(blocksRes.data ?? [])],
    series: [],
    members: [],
    roomTypes,
    amenityOptions,
    bookingHours: bookingHoursRes,
    displayHours: displayHoursRes,
    countWeekends: countWeekendsRes,
    tzOffset,
    bookingVisibility: { showTitle: false, showOrganizer: false },
    gcalTokens: {},
  }

  return Response.json(getAdminStats(store as any, from, to, roomId, roomType))
}
