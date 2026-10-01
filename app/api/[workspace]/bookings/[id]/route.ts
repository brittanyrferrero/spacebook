import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'
import { readAdminRole } from '@/lib/auth-cookies'

export async function PATCH(req: NextRequest, { params }: { params: { workspace: string; id: string } }) {
  const body = await req.json()
  const { _editor_name, _editor_email, _room_name, _scope, _cancel_token, ...patch } = body

  if (process.env.MOCK_MODE === 'true') {
    const [{ updateBooking, getBookingById }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const before = getBookingById(store, params.id)

    if (_scope === 'future' && before?.recurring_series_id && patch.start_time && patch.end_time) {
      const newS = new Date(patch.start_time), newE = new Date(patch.end_time)
      const durMs = newE.getTime() - newS.getTime()
      const newH = newS.getHours(), newM = newS.getMinutes()
      store.bookings
        .filter(b => b.recurring_series_id === before.recurring_series_id && !b.cancelled_at && new Date(b.start_time) >= new Date(before.start_time))
        .forEach(b => {
          const d = new Date(b.start_time)
          d.setHours(newH, newM, 0, 0)
          b.start_time = d.toISOString()
          b.end_time = new Date(d.getTime() + durMs).toISOString()
          if ('title' in patch) b.title = patch.title
          if ('booker_name' in patch) b.booker_name = patch.booker_name
          if ('booker_email' in patch) b.booker_email = patch.booker_email
        })
      await saveSessionStore(store)
      return Response.json(getBookingById(store, params.id))
    }

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

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: before } = await supabase.from('bookings').select('*, room:rooms(*)').eq('id', params.id).eq('workspace_id', workspaceId).single()
  if (!before) return Response.json({ error: 'Booking not found' }, { status: 404 })

  const isAdmin = !!await readAdminRole(req.cookies, params.workspace)
  const mbEmail = req.cookies.get(`mb_${params.workspace}`)?.value
  const isOwner = mbEmail && mbEmail.toLowerCase() === before.booker_email.toLowerCase()
  // A client that holds this exact booking's own cancel_token (e.g. straight
  // off the creation response, before any session/cookie exists) can prove
  // ownership of *this one row* the same way /api/cancel/[token] already
  // does — scoped to this booking only, not a broader identity claim like
  // the mb_ cookie is, so it can't be used to reach any other booking.
  const hasCancelToken = typeof _cancel_token === 'string' && _cancel_token === before.cancel_token
  if (!isAdmin && !isOwner && !hasCancelToken) {
    return Response.json({ error: "You don't have permission to edit this booking. Verify your email under My Bookings to manage it." }, { status: 403 })
  }

  if (_scope === 'future' && before.recurring_series_id && patch.start_time && patch.end_time) {
    const newS = new Date(patch.start_time), newE = new Date(patch.end_time)
    const durMs = newE.getTime() - newS.getTime()
    const newH = newS.getUTCHours(), newM = newS.getUTCMinutes()
    const { data: futureBkgs } = await supabase
      .from('bookings')
      .select('id, start_time, google_event_id')
      .eq('recurring_series_id', before.recurring_series_id)
      .eq('workspace_id', workspaceId)
      .gte('start_time', before.start_time)
      .is('cancelled_at', null)
    const conflictDates: string[] = []
    const updatedBkgs: { google_event_id: string; start_time: string; end_time: string }[] = []
    if (futureBkgs) {
      for (const bkg of futureBkgs) {
        const d = new Date(bkg.start_time)
        const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), newH, newM))
        const e = new Date(s.getTime() + durMs)
        const up: Record<string, unknown> = { start_time: s.toISOString(), end_time: e.toISOString() }
        if ('title' in patch) up.title = patch.title
        if ('booker_name' in patch) up.booker_name = patch.booker_name
        if ('booker_email' in patch) up.booker_email = patch.booker_email
        const { error: upErr } = await supabase.from('bookings').update(up).eq('id', bkg.id).eq('workspace_id', workspaceId)
        if (upErr) conflictDates.push(s.toISOString().slice(0, 10))
        else if (bkg.google_event_id) updatedBkgs.push({ google_event_id: bkg.google_event_id, start_time: s.toISOString(), end_time: e.toISOString() })
      }
    }
    const { data } = await supabase.from('bookings').select().eq('id', params.id).eq('workspace_id', workspaceId).single()

    if (updatedBkgs.length > 0 && before.room?.google_calendar_id) {
      const { updateCalendarEvent } = await import('@/lib/google-calendar/client')
      const room = before.room
      const bookerName = 'booker_name' in patch ? patch.booker_name : before.booker_name
      const bookerEmail = 'booker_email' in patch ? patch.booker_email : before.booker_email
      const title = 'title' in patch ? patch.title : before.title
      Promise.all(updatedBkgs.map(b =>
        updateCalendarEvent(b.google_event_id, room.google_calendar_id, room.id, { start_time: b.start_time, end_time: b.end_time, title, booker_name: bookerName, booker_email: bookerEmail }, room.name, room.gcal_resource_email)
      )).catch(() => {})
    }

    return Response.json({ booking: data, conflictDates })
  }

  const { data, error } = await supabase.from('bookings').update(patch).eq('id', params.id).eq('workspace_id', workspaceId).select().single()
  if (error) {
    const isConflict = error.code === '23P01'
    return Response.json({ error: isConflict ? 'That time slot is already taken.' : error.message }, { status: isConflict ? 409 : 500 })
  }

  if (_editor_email && _editor_email !== before.booker_email) {
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

  if (data.google_event_id && before.room?.google_calendar_id) {
    const { updateCalendarEvent } = await import('@/lib/google-calendar/client')
    updateCalendarEvent(data.google_event_id, before.room.google_calendar_id, before.room.id, data, before.room.name, before.room.gcal_resource_email).catch(() => {})
  }

  return Response.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { workspace: string; id: string } }) {
  if (process.env.MOCK_MODE === 'true') {
    const [{ cancelBooking, getBookingById }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const b = getBookingById(store, params.id)
    if (!b) return Response.json({ error: 'Not found' }, { status: 404 })
    const result = cancelBooking(store, b.cancel_token, 'this')
    await saveSessionStore(store)
    return Response.json(result)
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: booking } = await supabase.from('bookings').select('*, room:rooms(*)').eq('id', params.id).eq('workspace_id', workspaceId).single()
  if (!booking) return Response.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = !!await readAdminRole(req.cookies, params.workspace)
  const mbEmail = req.cookies.get(`mb_${params.workspace}`)?.value
  const isOwner = mbEmail && mbEmail.toLowerCase() === booking.booker_email.toLowerCase()
  if (!isAdmin && !isOwner) return Response.json({ error: 'Forbidden.' }, { status: 403 })

  const { error } = await supabase.from('bookings').update({ cancelled_at: new Date().toISOString() }).eq('id', params.id).eq('workspace_id', workspaceId)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  if (booking.google_event_id && booking.room?.google_calendar_id) {
    const { deleteCalendarEvent } = await import('@/lib/google-calendar/client')
    deleteCalendarEvent(booking.google_event_id, booking.room.google_calendar_id, booking.room.id).catch(() => {})
  }

  return Response.json({ ok: true })
}
