import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'
import type { Booking } from '@/types'
import { isValidEmail } from '@/lib/email'
import { notifyRequesters } from '@/lib/booking-requests'
import { workspaceTimeZone } from '@/lib/time-zone'
import {
  accessFor, cleanName, isChangeReason, isPlaceholderEmail, reasonError, shouldNotifyBooker,
  type BookingAccess, type ChangeReason,
} from '@/lib/booking-access'

// Fields anyone in the workspace may change on someone else's booking (ADR-023).
// Who it belongs to can only be changed with direct access, so nobody can
// redirect another person's booking emails.
const OPEN_FIELDS = ['start_time', 'end_time', 'title'] as const
const OWNER_FIELDS = ['booker_name', 'booker_email'] as const

function allowedPatch(body: Record<string, unknown>, access: BookingAccess): { patch: Record<string, unknown>; error?: string } {
  const patch: Record<string, unknown> = {}
  for (const f of OPEN_FIELDS) if (f in body) patch[f] = body[f]
  for (const f of OWNER_FIELDS) {
    if (!(f in body)) continue
    if (access !== 'direct') return { patch, error: "Only the booker can change who a booking belongs to." }
    patch[f] = body[f]
  }
  if ('booker_email' in patch && !isValidEmail(patch.booker_email)) return { patch, error: 'Invalid email address.' }
  if (Object.keys(patch).length === 0) return { patch, error: 'Nothing to change.' }
  return { patch }
}

export async function PATCH(req: NextRequest, { params }: { params: { workspace: string; id: string } }) {
  const body = await req.json()
  const { _editor_name, _editor_email, _room_name, _scope, _reason, _actor_name } = body
  const actorName = cleanName(_actor_name)
  const isAdmin = !!req.cookies.get(`admin_${params.workspace}`)?.value
  const mbEmail = req.cookies.get(`mb_${params.workspace}`)?.value ?? null

  if (process.env.MOCK_MODE === 'true') {
    const [{ updateBooking, getBookingById }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const before = getBookingById(store, params.id)
    if (!before) return Response.json({ error: 'Booking not found' }, { status: 404 })
    const access = accessFor(before, { isAdmin, mbEmail })
    const reasonErr = reasonError(access, _reason, actorName)
    if (reasonErr) return Response.json({ error: reasonErr, code: 'reason_required' }, { status: 400 })
    const { patch, error: patchErr } = allowedPatch(body, access)
    if (patchErr) return Response.json({ error: patchErr }, { status: 400 })

    if (_scope === 'future' && before.recurring_series_id && patch.start_time && patch.end_time) {
      const newS = new Date(patch.start_time as string), newE = new Date(patch.end_time as string)
      const durMs = newE.getTime() - newS.getTime()
      const newH = newS.getHours(), newM = newS.getMinutes()
      store.bookings
        .filter(b => b.recurring_series_id === before.recurring_series_id && !b.cancelled_at && new Date(b.start_time) >= new Date(before.start_time))
        .forEach(b => {
          const d = new Date(b.start_time)
          d.setHours(newH, newM, 0, 0)
          b.start_time = d.toISOString()
          b.end_time = new Date(d.getTime() + durMs).toISOString()
          if ('title' in patch) b.title = patch.title as string | null
          if ('booker_name' in patch) b.booker_name = patch.booker_name as string
          if ('booker_email' in patch) b.booker_email = patch.booker_email as string
        })
      await saveSessionStore(store)
      return Response.json(getBookingById(store, params.id))
    }

    const snapshot = { ...before }
    const booking = updateBooking(store, params.id, patch)
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 })
    await saveSessionStore(store)
    if (shouldNotifyBooker(access, snapshot.booker_email)) console.log('[mock] would email booker about edit:', snapshot.booker_email, _reason, actorName)
    if (timesChanged(snapshot, booking)) await notifyRequesters(snapshot, _room_name ?? '', 'moved', await workspaceTimeZone(null))
    return Response.json(booking)
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: before } = await supabase.from('bookings').select('*, room:rooms(*)').eq('id', params.id).eq('workspace_id', workspaceId).single()
  if (!before) return Response.json({ error: 'Booking not found' }, { status: 404 })
  if (before.is_block && !isAdmin) return Response.json({ error: 'Only an admin can change a room block.' }, { status: 403 })

  // Anyone in the workspace may edit (ADR-023); without direct access they
  // must say why, and the booker is emailed.
  const access = accessFor(before, { isAdmin, mbEmail })
  const reasonErr = reasonError(access, _reason, actorName)
  if (reasonErr) return Response.json({ error: reasonErr, code: 'reason_required' }, { status: 400 })
  const { patch, error: patchErr } = allowedPatch(body, access)
  if (patchErr) return Response.json({ error: patchErr }, { status: 400 })
  const roomName = before.room?.name ?? _room_name ?? ''
  const timeZone = await workspaceTimeZone(workspaceId)

  if (_scope === 'future' && before.recurring_series_id && patch.start_time && patch.end_time) {
    const newS = new Date(patch.start_time as string), newE = new Date(patch.end_time as string)
    const durMs = newE.getTime() - newS.getTime()
    const newH = newS.getUTCHours(), newM = newS.getUTCMinutes()
    const { data: futureBkgs } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, google_event_id')
      .eq('recurring_series_id', before.recurring_series_id)
      .eq('workspace_id', workspaceId)
      .gte('start_time', before.start_time)
      .is('cancelled_at', null)
    const conflictDates: string[] = []
    const updatedBkgs: { google_event_id: string; start_time: string; end_time: string }[] = []
    const moved: { id: string; booker_name: string; start_time: string; end_time: string }[] = []
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
        if (upErr) { conflictDates.push(s.toISOString().slice(0, 10)); continue }
        if (bkg.google_event_id) updatedBkgs.push({ google_event_id: bkg.google_event_id, start_time: s.toISOString(), end_time: e.toISOString() })
        if (timesChanged(bkg, up as { start_time: string; end_time: string })) moved.push({ id: bkg.id, booker_name: before.booker_name, start_time: bkg.start_time, end_time: bkg.end_time })
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

    if (data) await emailBookerAboutEdit({ access, reason: _reason, actorName, editorName: _editor_name, editorEmail: _editor_email, before, after: data, roomName, timeZone })
    await Promise.all(moved.map(m => notifyRequesters(m, roomName, 'moved', timeZone)))

    return Response.json({ booking: data, conflictDates })
  }

  const { data, error } = await supabase.from('bookings').update(patch).eq('id', params.id).eq('workspace_id', workspaceId).select().single()
  if (error) {
    const isConflict = error.code === '23P01'
    return Response.json({ error: isConflict ? 'That time slot is already taken.' : error.message }, { status: isConflict ? 409 : 500 })
  }

  await emailBookerAboutEdit({ access, reason: _reason, actorName, editorName: _editor_name, editorEmail: _editor_email, before, after: data, roomName, timeZone })
  if (timesChanged(before, data)) await notifyRequesters(before, roomName, 'moved', timeZone)

  if (data.google_event_id && before.room?.google_calendar_id) {
    const { updateCalendarEvent } = await import('@/lib/google-calendar/client')
    updateCalendarEvent(data.google_event_id, before.room.google_calendar_id, before.room.id, data, before.room.name, before.room.gcal_resource_email).catch(() => {})
  }

  return Response.json(data)
}

function timesChanged(a: { start_time: string; end_time: string }, b: { start_time: string; end_time: string }) {
  return new Date(a.start_time).getTime() !== new Date(b.start_time).getTime() || new Date(a.end_time).getTime() !== new Date(b.end_time).getTime()
}

/** ADR-023: a change made with a reason always tells the booker. A direct change
 *  by someone else who identified themselves (e.g. an admin) still does, as before. */
async function emailBookerAboutEdit({ access, reason, actorName, editorName, editorEmail, before, after, roomName, timeZone }: {
  access: BookingAccess
  reason: unknown
  actorName: string
  editorName: unknown
  editorEmail: unknown
  before: Booking
  after: Booking
  roomName: string
  timeZone: string | null
}) {
  if (isPlaceholderEmail(before.booker_email)) return
  const withReason = shouldNotifyBooker(access, before.booker_email) && isChangeReason(reason)
  const directByOther = access === 'direct' && typeof editorEmail === 'string' && !!editorEmail
    && editorEmail.toLowerCase() !== before.booker_email.toLowerCase()
  if (!withReason && !directByOther) return
  const { sendBookingEditedEmail } = await import('@/lib/email')
  await sendBookingEditedEmail({
    to: before.booker_email,
    bookerName: before.booker_name,
    editorName: withReason ? actorName : (typeof editorName === 'string' && editorName) || 'Someone',
    editorEmail: withReason ? undefined : (editorEmail as string),
    reason: withReason ? (reason as ChangeReason) : undefined,
    roomName,
    oldStartTime: before.start_time,
    oldEndTime: before.end_time,
    newStartTime: after.start_time,
    newEndTime: after.end_time,
    title: after.title,
    cancelToken: after.cancel_token,
    timeZone,
  }).catch(e => console.error('[bookings PATCH] booker email failed:', e))
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

  const isAdmin = !!req.cookies.get(`admin_${params.workspace}`)?.value
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
