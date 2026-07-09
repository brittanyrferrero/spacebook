import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'

// ─── Shared conflict-detection helpers ───────────────────────────────────────

/** Returns non-cancelled, non-block bookings that overlap [start, end) for roomId. */
function overlapsInterval(bStart: Date, bEnd: Date, start: Date, end: Date): boolean {
  return bStart < end && bEnd > start
}

// ─── GET — preview (dry run) ──────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: { workspace: string } }) {
  const cookieHeader = req.cookies.get(`admin_${params.workspace}`)
  if (!cookieHeader?.value) return Response.json({ error: 'Forbidden.' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const roomId = searchParams.get('room_id')
  const startTime = searchParams.get('start_time')
  const endTime = searchParams.get('end_time')
  if (!roomId || !startTime || !endTime)
    return Response.json({ error: 'Missing room_id, start_time, or end_time.' }, { status: 400 })

  const blockStart = new Date(startTime)
  const blockEnd = new Date(endTime)

  if (process.env.MOCK_MODE === 'true') {
    const { getSessionStore } = await import('@/lib/mock/store')
    const store = await getSessionStore()

    const room = store.rooms.find(r => r.id === roomId)
    if (!room) return Response.json({ error: 'Room not found.' }, { status: 404 })

    // All rooms of same type that are active (excluding the blocked room)
    const equivalentRooms = store.rooms.filter(
      r => r.is_active && r.room_type === room.room_type && r.id !== roomId
    )

    const conflicts = store.bookings.filter(b => {
      if (b.cancelled_at || b.is_block || b.room_id !== roomId) return false
      return overlapsInterval(new Date(b.start_time), new Date(b.end_time), blockStart, blockEnd)
    })

    const result = conflicts.map(b => {
      const bStart = new Date(b.start_time)
      const bEnd = new Date(b.end_time)
      const equivalent = equivalentRooms.find(er =>
        !store.bookings.some(ob => {
          if (ob.cancelled_at || ob.room_id !== er.id) return false
          return overlapsInterval(new Date(ob.start_time), new Date(ob.end_time), bStart, bEnd)
        })
      )
      return {
        id: b.id,
        bookerName: b.booker_name,
        date: bStart.toISOString().slice(0, 10),
        time: `${bStart.toISOString().slice(11, 16)} – ${bEnd.toISOString().slice(11, 16)}`,
        hasEquivalent: !!equivalent,
        equivalentRoomName: equivalent?.name ?? null,
      }
    })

    return Response.json({ conflictCount: result.length, conflicts: result })
  }

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found.' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .eq('workspace_id', workspaceId)
    .single()
  if (!room) return Response.json({ error: 'Room not found.' }, { status: 404 })

  // Find conflicting bookings in the block range
  const { data: conflicts } = await supabase
    .from('bookings')
    .select('*')
    .eq('room_id', roomId)
    .eq('workspace_id', workspaceId)
    .eq('is_block', false)
    .is('cancelled_at', null)
    .lt('start_time', endTime)
    .gt('end_time', startTime)

  const { data: equivalentRooms } = await supabase
    .from('rooms')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .eq('room_type', room.room_type)
    .neq('id', roomId)

  const result = await Promise.all(
    (conflicts ?? []).map(async b => {
      const bStart = new Date(b.start_time)
      const bEnd = new Date(b.end_time)

      let equivalent = null
      for (const er of equivalentRooms ?? []) {
        const { count } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', er.id)
          .is('cancelled_at', null)
          .lt('start_time', b.end_time)
          .gt('end_time', b.start_time)
          .then(r => ({ count: r.count ?? 0 }))
        if (count === 0) { equivalent = er; break }
      }

      return {
        id: b.id,
        bookerName: b.booker_name,
        date: bStart.toISOString().slice(0, 10),
        time: `${String(bStart.getUTCHours()).padStart(2, '0')}:${String(bStart.getUTCMinutes()).padStart(2, '0')} – ${String(bEnd.getUTCHours()).padStart(2, '0')}:${String(bEnd.getUTCMinutes()).padStart(2, '0')}`,
        hasEquivalent: !!equivalent,
        equivalentRoomName: equivalent?.name ?? null,
      }
    })
  )

  return Response.json({ conflictCount: result.length, conflicts: result })
}

// ─── POST — commit block ──────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: { workspace: string } }) {
  const cookieHeader = req.cookies.get(`admin_${params.workspace}`)
  if (!cookieHeader?.value) return Response.json({ error: 'Forbidden.' }, { status: 403 })

  const body = await req.json()
  const { room_id, start_time, end_time, reason } = body as {
    room_id?: string
    start_time?: string
    end_time?: string
    reason?: string
  }
  if (!room_id || !start_time || !end_time)
    return Response.json({ error: 'Missing room_id, start_time, or end_time.' }, { status: 400 })

  const blockStart = new Date(start_time)
  const blockEnd = new Date(end_time)
  const { sendBlockRebookedEmail, sendBlockCancelledEmail } = await import('@/lib/email')

  // ── MOCK_MODE path ────────────────────────────────────────────────────────

  if (process.env.MOCK_MODE === 'true') {
    const { getSessionStore, saveSessionStore } = await import('@/lib/mock/store')
    const store = await getSessionStore()

    const room = store.rooms.find(r => r.id === room_id)
    if (!room) return Response.json({ error: 'Room not found.' }, { status: 404 })

    const blockToken = crypto.randomUUID().replace(/-/g, '').slice(0, 64)
    const block = {
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
      room_id,
      recurring_series_id: null as string | null,
      booker_name: 'Room block',
      booker_email: 'block@internal.local',
      title: reason ?? 'Room unavailable',
      start_time: blockStart.toISOString(),
      end_time: blockEnd.toISOString(),
      cancel_token: blockToken,
      google_event_id: null as string | null,
      cancelled_at: null as string | null,
      created_at: new Date().toISOString(),
      origin: 'desktop' as const,
      is_block: true,
    }
    store.bookings.push(block)

    const conflictBookings = store.bookings.filter(b => {
      if (b.id === block.id || b.cancelled_at || b.is_block || b.room_id !== room_id) return false
      return overlapsInterval(new Date(b.start_time), new Date(b.end_time), blockStart, blockEnd)
    })

    const equivalentRooms = store.rooms.filter(
      r => r.is_active && r.room_type === room.room_type && r.id !== room_id
    )

    const rebooked: typeof conflictBookings = []
    const cancelled: typeof conflictBookings = []
    const now = new Date().toISOString()

    for (const cb of conflictBookings) {
      const cbStart = new Date(cb.start_time)
      const cbEnd = new Date(cb.end_time)
      const equivalent = equivalentRooms.find(er =>
        !store.bookings.some(ob => {
          if (ob.cancelled_at || ob.room_id !== er.id) return false
          return overlapsInterval(new Date(ob.start_time), new Date(ob.end_time), cbStart, cbEnd)
        })
      )

      cb.cancelled_at = now

      if (equivalent) {
        const newToken = crypto.randomUUID().replace(/-/g, '').slice(0, 64)
        const newBooking = {
          ...cb,
          id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
          room_id: equivalent.id,
          cancel_token: newToken,
          cancelled_at: null as string | null,
          created_at: new Date().toISOString(),
          google_event_id: null as string | null,
          is_block: false,
        }
        store.bookings.push(newBooking)
        rebooked.push(cb)

        sendBlockRebookedEmail({
          to: cb.booker_email,
          bookerName: cb.booker_name,
          originalRoomName: room.name,
          newRoomName: equivalent.name,
          startTime: cb.start_time,
          endTime: cb.end_time,
          reason,
          workspaceSlug: params.workspace,
        }).catch(() => {})
      } else {
        cancelled.push(cb)

        sendBlockCancelledEmail({
          to: cb.booker_email,
          bookerName: cb.booker_name,
          roomName: room.name,
          startTime: cb.start_time,
          endTime: cb.end_time,
          reason,
          workspaceSlug: params.workspace,
        }).catch(() => {})
      }
    }

    await saveSessionStore(store)
    return Response.json({ block, rebooked, cancelled }, { status: 201 })
  }

  // ── Production path ───────────────────────────────────────────────────────

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found.' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', room_id)
    .eq('workspace_id', workspaceId)
    .single()
  if (!room) return Response.json({ error: 'Room not found.' }, { status: 404 })

  // Resolve conflicting bookings first — the no_overlapping_bookings exclusion
  // constraint applies to any non-cancelled row, so the block insert below would
  // fail if a conflicting booking is still active when it runs.
  const { data: conflicts } = await supabase
    .from('bookings')
    .select('*')
    .eq('room_id', room_id)
    .eq('workspace_id', workspaceId)
    .eq('is_block', false)
    .is('cancelled_at', null)
    .lt('start_time', end_time)
    .gt('end_time', start_time)

  const { data: equivalentRooms } = await supabase
    .from('rooms')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .eq('room_type', room.room_type)
    .neq('id', room_id)

  const rebooked: unknown[] = []
  const cancelled: unknown[] = []
  const now = new Date().toISOString()

  for (const cb of conflicts ?? []) {
    // Find an equivalent room free during this exact slot
    let equivalent = null
    for (const er of equivalentRooms ?? []) {
      const { count } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', er.id)
        .is('cancelled_at', null)
        .lt('start_time', cb.end_time)
        .gt('end_time', cb.start_time)
        .then(r => ({ count: r.count ?? 0 }))
      if (count === 0) { equivalent = er; break }
    }

    // Soft-cancel original
    await supabase.from('bookings').update({ cancelled_at: now }).eq('id', cb.id)

    if (equivalent) {
      // Create new booking in equivalent room
      const newToken = crypto.randomUUID().replace(/-/g, '').slice(0, 64)
      const { data: newBooking } = await supabase
        .from('bookings')
        .insert({
          room_id: equivalent.id,
          workspace_id: workspaceId,
          booker_name: cb.booker_name,
          booker_email: cb.booker_email,
          title: cb.title,
          start_time: cb.start_time,
          end_time: cb.end_time,
          cancel_token: newToken,
          origin: cb.origin ?? 'desktop',
          cancelled_at: null,
          ...(cb.recurring_series_id ? { recurring_series_id: cb.recurring_series_id } : {}),
        })
        .select()
        .single()

      rebooked.push({ original: cb, replacement: newBooking })

      sendBlockRebookedEmail({
        to: cb.booker_email,
        bookerName: cb.booker_name,
        originalRoomName: room.name,
        newRoomName: equivalent.name,
        startTime: cb.start_time,
        endTime: cb.end_time,
        reason,
        workspaceSlug: params.workspace,
      }).catch(() => {})
    } else {
      cancelled.push(cb)

      sendBlockCancelledEmail({
        to: cb.booker_email,
        bookerName: cb.booker_name,
        roomName: room.name,
        startTime: cb.start_time,
        endTime: cb.end_time,
        reason,
        workspaceSlug: params.workspace,
      }).catch(() => {})
    }
  }

  // Insert the block booking now that conflicting bookings are cancelled/moved
  const blockToken = crypto.randomUUID().replace(/-/g, '').slice(0, 64)
  const { data: block, error: blockError } = await supabase
    .from('bookings')
    .insert({
      room_id,
      workspace_id: workspaceId,
      booker_name: 'Room block',
      booker_email: 'block@internal.local',
      title: reason ?? 'Room unavailable',
      start_time,
      end_time,
      is_block: true,
      cancel_token: blockToken,
      origin: 'desktop',
      cancelled_at: null,
    })
    .select()
    .single()

  if (blockError) return Response.json({ error: blockError.message }, { status: 500 })

  return Response.json({ block, rebooked, cancelled }, { status: 201 })
}
