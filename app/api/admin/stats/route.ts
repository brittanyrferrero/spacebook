import { type NextRequest } from 'next/server'
import { subDays, format } from 'date-fns'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const to = searchParams.get('to') ?? format(new Date(), 'yyyy-MM-dd')
  const from = searchParams.get('from') ?? format(subDays(new Date(), 29), 'yyyy-MM-dd')

  if (process.env.MOCK_MODE === 'true') {
    const [{ getAdminStats }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const roomId = searchParams.get('room_id') ?? undefined
    const roomType = searchParams.get('room_type') ?? undefined
    return Response.json(getAdminStats(await getSessionStore(), from, to, roomId, roomType))
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const roomId = searchParams.get('room_id') ?? undefined
  const roomType = searchParams.get('room_type') ?? undefined

  const [roomsRes, bookingsRes, displayHoursRes, bookingHoursRes] = await Promise.all([
    supabase.from('rooms').select('*').order('display_order'),
    supabase.from('bookings').select('*')
      .gte('start_time', `${from}T00:00:00Z`)
      .lte('start_time', `${to}T23:59:59Z`)
      .is('cancelled_at', null),
    import('@/lib/prod-config').then(m => m.getDisplayHours()),
    import('@/lib/prod-config').then(m => m.getBookingHours()),
  ])

  // Build a mock-compatible store subset and reuse the computation
  const { getAdminStats } = await import('@/lib/mock/api')
  const { getAmenityOptions, getRoomTypes } = await import('@/lib/prod-config')
  const [amenityOptions, roomTypes] = await Promise.all([getAmenityOptions(), getRoomTypes()])

  const store = {
    rooms: (roomsRes.data ?? []).map((r: any) => ({ ...r, gcal_connected: false })),
    bookings: bookingsRes.data ?? [],
    series: [],
    members: [],
    roomTypes,
    amenityOptions,
    bookingHours: bookingHoursRes,
    displayHours: displayHoursRes,
    bookingVisibility: { showTitle: false, showOrganizer: false },
    gcalTokens: {},
  }

  return Response.json(getAdminStats(store as any, from, to, roomId, roomType))
}
