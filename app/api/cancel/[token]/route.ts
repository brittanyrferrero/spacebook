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
  const { data: booking } = await supabase.from('bookings').select('*, room:rooms(*)').eq('cancel_token', params.token).single()
  if (!booking) return Response.json({ error: 'Booking not found.' }, { status: 404 })

  const now = new Date().toISOString()
  await supabase.from('bookings').update({ cancelled_at: now }).eq('cancel_token', params.token)

  if (booking.google_event_id && booking.room?.google_calendar_id) {
    try {
      const { deleteCalendarEvent } = await import('@/lib/google-calendar/client')
      await deleteCalendarEvent(booking.google_event_id, booking.room.google_calendar_id, booking.room.id)
    } catch { /* non-fatal */ }
  }

  return Response.json({ cancelled: 1 })
}
