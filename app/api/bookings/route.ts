import { type NextRequest } from 'next/server'
import { getBookingsForDate } from '@/lib/data'
import type { CreateBookingPayload } from '@/types'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const roomId = searchParams.get('room_id') ?? undefined
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const email = searchParams.get('email')
  if (email) {
    if (process.env.MOCK_MODE === 'true') {
      const [{ getBookingsByEmail }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
      return Response.json(getBookingsByEmail(await getSessionStore(), email))
    }
    return Response.json([])
  }

  if (from && to) {
    const { getBookingsForRange } = await import('@/lib/data')
    const bookings = await getBookingsForRange(from, to, roomId)
    return Response.json(bookings)
  }

  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const bookings = await getBookingsForDate(date, roomId)
  return Response.json(bookings)
}

export async function POST(req: NextRequest) {
  const payload: CreateBookingPayload = await req.json()

  if (!payload.room_id || !payload.booker_name || !payload.booker_email || !payload.start_time || !payload.end_time) {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  if (process.env.MOCK_MODE === 'true') {
    const [{ createBooking }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const result = createBooking(store, payload)
    if (result.error) return Response.json({ error: result.error }, { status: 409 })
    await saveSessionStore(store)
    return Response.json(result, { status: 201 })
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({ room_id: payload.room_id, booker_name: payload.booker_name, booker_email: payload.booker_email, title: payload.title ?? null, start_time: payload.start_time, end_time: payload.end_time })
    .select()
    .single()

  if (error) {
    const isConflict = error.code === '23P01'
    return Response.json({ error: isConflict ? 'That time slot is no longer available.' : error.message }, { status: isConflict ? 409 : 500 })
  }

  try {
    const { createCalendarEvent } = await import('@/lib/google-calendar/client')
    const { data: room } = await supabase.from('rooms').select('*').eq('id', payload.room_id).single()
    if (room) {
      const eventId = await createCalendarEvent(booking, room)
      if (eventId) await supabase.from('bookings').update({ google_event_id: eventId }).eq('id', booking.id)
    }
  } catch { /* non-fatal */ }

  return Response.json({ booking }, { status: 201 })
}
