import { type NextRequest } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const { _editor_name, _editor_email, _room_name, ...patch } = body

  if (process.env.MOCK_MODE === 'true') {
    const [{ updateBooking, getBookingById }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const before = getBookingById(store, params.id)
    const booking = updateBooking(store, params.id, patch)
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 })
    await saveSessionStore(store)

    if (before && _editor_email && _editor_email !== before.booker_email) {
      const { sendBookingEditedEmail } = await import('@/lib/email')
      sendBookingEditedEmail({
        to: before.booker_email,
        bookerName: before.booker_name,
        editorName: _editor_name ?? 'Someone',
        editorEmail: _editor_email,
        roomName: _room_name ?? '',
        oldStartTime: before.start_time,
        oldEndTime: before.end_time,
        newStartTime: booking.start_time,
        newEndTime: booking.end_time,
        title: booking.title,
        cancelToken: booking.cancel_token,
      }).catch(() => {})
    }

    return Response.json(booking)
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: before } = await supabase.from('bookings').select('*').eq('id', params.id).single()
  const { data, error } = await supabase.from('bookings').update(patch).eq('id', params.id).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  if (before && _editor_email && _editor_email !== before.booker_email) {
    const { sendBookingEditedEmail } = await import('@/lib/email')
    sendBookingEditedEmail({
      to: before.booker_email,
      bookerName: before.booker_name,
      editorName: _editor_name ?? 'Someone',
      editorEmail: _editor_email,
      roomName: _room_name ?? '',
      oldStartTime: before.start_time,
      oldEndTime: before.end_time,
      newStartTime: data.start_time,
      newEndTime: data.end_time,
      title: data.title,
      cancelToken: data.cancel_token,
    }).catch(() => {})
  }

  return Response.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (process.env.MOCK_MODE === 'true') {
    const [{ cancelBooking, getBookingById }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const b = getBookingById(store, params.id)
    if (!b) return Response.json({ error: 'Not found' }, { status: 404 })
    const result = cancelBooking(store, b.cancel_token, 'this')
    await saveSessionStore(store)
    return Response.json(result)
  }
  return Response.json({ message: 'TODO' })
}
