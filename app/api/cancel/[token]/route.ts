import { type NextRequest } from 'next/server'
import type { CancelScope } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { scope = 'this' }: { scope: CancelScope } = await req.json().catch(() => ({ scope: 'this' }))

  if (process.env.MOCK_MODE === 'true') {
    const [{ cancelBooking }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const result = cancelBooking(store, params.token, scope)
    if (result.error) return Response.json({ error: result.error }, { status: 404 })
    await saveSessionStore(store)
    return Response.json(result)
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: booking } = await supabase.from('bookings').select('*, room:rooms(*)').eq('cancel_token', params.token).is('cancelled_at', null).single()
  if (!booking) return Response.json({ error: 'Booking already cancelled or not found.' }, { status: 410 })

  const now = new Date().toISOString()

  if (scope === 'future' && booking.recurring_series_id) {
    const { data: futureBkgs } = await supabase
      .from('bookings')
      .select('id, google_event_id')
      .eq('recurring_series_id', booking.recurring_series_id)
      .gte('start_time', booking.start_time)
      .is('cancelled_at', null)

    if (futureBkgs && futureBkgs.length > 0) {
      const ids = futureBkgs.map(b => b.id)
      await supabase.from('bookings').update({ cancelled_at: now }).in('id', ids)

      const toDelete = futureBkgs.filter(b => b.google_event_id)
      if (toDelete.length > 0 && booking.room?.google_calendar_id) {
        const { deleteCalendarEvent } = await import('@/lib/google-calendar/client')
        Promise.all(toDelete.map(b =>
          deleteCalendarEvent(b.google_event_id, booking.room.google_calendar_id, booking.room.id)
        )).catch(() => {})
      }
    }

    return Response.json({ cancelled: futureBkgs?.length ?? 0 })
  }

  await supabase.from('bookings').update({ cancelled_at: now }).eq('cancel_token', params.token)

  if (booking.google_event_id && booking.room?.google_calendar_id) {
    const { deleteCalendarEvent } = await import('@/lib/google-calendar/client')
    deleteCalendarEvent(booking.google_event_id, booking.room.google_calendar_id, booking.room.id).catch(() => {})
  }

  return Response.json({ cancelled: 1 })
}
