import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getBookingsForDate, getBookingsForRange } from '@/lib/data'
import { getWorkspaceId } from '@/lib/workspace'
import type { CreateBookingPayload } from '@/types'
import { ratelimit, getIP } from '@/lib/ratelimit'
import { isValidEmail } from '@/lib/email'

const rl = ratelimit(20, '1 m')

export async function GET(req: NextRequest, { params }: { params: { workspace: string } }) {
  const { searchParams } = req.nextUrl
  const roomId = searchParams.get('room_id') ?? undefined
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const email = searchParams.get('email')

  if (process.env.MOCK_MODE === 'true') {
    const [{ getBookingsByEmail, getBookingsForDate: mockDate, getBookingsForRange: mockRange }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    if (email) return Response.json(getBookingsByEmail(store, email))
    if (from && to) return Response.json(mockRange(store, from, to, roomId))
    return Response.json(mockDate(store, searchParams.get('date') ?? new Date().toISOString().slice(0, 10), roomId))
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })

  if (email) {
    const cookieStore = await cookies()
    const isAdmin = !!cookieStore.get(`admin_${params.workspace}`)?.value
    const mbEmail = cookieStore.get(`mb_${params.workspace}`)?.value ?? null
    const isSelf = mbEmail && mbEmail.toLowerCase() === email.trim().toLowerCase()
    if (!isAdmin && !isSelf) {
      return Response.json({ error: 'Forbidden.' }, { status: 403 })
    }
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .ilike('booker_email', email)
      .is('cancelled_at', null)
      .order('start_time', { ascending: true })
    return Response.json(data ?? [])
  }

  if (from && to) return Response.json(await getBookingsForRange(from, to, roomId, workspaceId))
  return Response.json(await getBookingsForDate(searchParams.get('date') ?? new Date().toISOString().slice(0, 10), roomId, workspaceId))
}

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const payload: CreateBookingPayload = await req.json()
  if (!payload.room_id || !payload.booker_name || !payload.booker_email || !payload.start_time || !payload.end_time)
    return Response.json({ error: 'Missing required fields.' }, { status: 400 })
  if (!isValidEmail(payload.booker_email)) return Response.json({ error: 'Invalid email address.' }, { status: 400 })
  if (typeof payload.booker_name === 'string' && payload.booker_name.length > 200)
    return Response.json({ error: 'Name must be 200 characters or fewer.' }, { status: 400 })

  if (payload.recurrence?.series_end) {
    const maxEnd = new Date()
    maxEnd.setFullYear(maxEnd.getFullYear() + 1)
    if (new Date(payload.recurrence.series_end) > maxEnd) {
      return Response.json({ error: 'Series end date cannot be more than 1 year from today.' }, { status: 400 })
    }
  }

  if (process.env.MOCK_MODE === 'true') {
    const [{ createBooking }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const result = createBooking(store, payload)
    if (result.error) return Response.json({ error: result.error }, { status: 409 })
    await saveSessionStore(store)
    return Response.json(result, { status: 201 })
  }

  const { success } = await rl.limit(getIP(req))
  if (!success) return Response.json({ error: 'Too many requests.' }, { status: 429 })

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found' }, { status: 404 })
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { getLimits } = await import('@/lib/prod-config')
  const limits = await getLimits(workspaceId)
  if (limits?.max_bookings != null) {
    const { count } = await supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).then(r => ({ count: r.count ?? 0 }))
    if (count >= limits.max_bookings) {
      return Response.json({ error: `Booking limit reached (${limits.max_bookings}). Upgrade to continue making bookings.` }, { status: 403 })
    }
  }

  // Auto-add booker to members directory (non-fatal)
  const upsertMember = async () => {
    try {
      await supabase.from('members').upsert(
        { name: payload.booker_name, email: payload.booker_email.toLowerCase(), workspace_id: workspaceId },
        { onConflict: 'email,workspace_id', ignoreDuplicates: false }
      )
    } catch { /* non-fatal */ }
  }

  if (payload.recurrence) {
    const { frequency, days_of_week, series_end } = payload.recurrence
    const start = new Date(payload.start_time)
    const end = new Date(payload.end_time)
    const durMs = end.getTime() - start.getTime()
    const seriesStart = start.toISOString().slice(0, 10)
    const padTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

    const { data: series, error: seriesError } = await supabase
      .from('recurring_series')
      .insert({
        room_id: payload.room_id,
        booker_name: payload.booker_name,
        booker_email: payload.booker_email,
        title: payload.title ?? null,
        start_time: padTime(start),
        end_time: padTime(end),
        frequency,
        days_of_week: days_of_week ?? null,
        series_start: seriesStart,
        series_end,
      })
      .select().single()

    if (seriesError) return Response.json({ error: seriesError.message }, { status: 500 })

    const { generateOccurrenceDates } = await import('@/lib/recurring')
    const occurrences = generateOccurrenceDates(frequency, days_of_week ?? null, seriesStart, series_end)

    const conflictDates: string[] = []
    let firstBooking = null

    for (const occ of occurrences) {
      const occStart = new Date(occ)
      occStart.setHours(start.getHours(), start.getMinutes(), 0, 0)
      const occEnd = new Date(occStart.getTime() + durMs)

      const { data: b, error: bError } = await supabase
        .from('bookings')
        .insert({
          room_id: payload.room_id,
          recurring_series_id: series.id,
          booker_name: payload.booker_name,
          booker_email: payload.booker_email,
          title: payload.title ?? null,
          start_time: occStart.toISOString(),
          end_time: occEnd.toISOString(),
          workspace_id: workspaceId,
          origin: payload.origin ?? 'desktop',
        })
        .select().single()

      if (bError) { conflictDates.push(occStart.toISOString().slice(0, 10)); continue }
      if (!firstBooking) firstBooking = b
    }

    await upsertMember()
    return Response.json({ booking: firstBooking, series, conflictDates }, { status: 201 })
  }

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({ room_id: payload.room_id, booker_name: payload.booker_name, booker_email: payload.booker_email, title: payload.title ?? null, start_time: payload.start_time, end_time: payload.end_time, workspace_id: workspaceId, origin: payload.origin ?? 'desktop', ...(payload.recurring_series_id ? { recurring_series_id: payload.recurring_series_id } : {}) })
    .select().single()
  if (error) {
    const isConflict = error.code === '23P01'
    return Response.json({ error: isConflict ? 'That time slot is no longer available.' : error.message }, { status: isConflict ? 409 : 500 })
  }

  await upsertMember()

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
