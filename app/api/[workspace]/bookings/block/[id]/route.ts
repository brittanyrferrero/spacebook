import { type NextRequest } from 'next/server'
import { getWorkspaceId } from '@/lib/workspace'
import { readAdminRole } from '@/lib/auth-cookies'

function overlapsInterval(bStart: Date, bEnd: Date, start: Date, end: Date): boolean {
  return bStart < end && bEnd > start
}

// ─── PATCH — edit block (update times/reason, handle new conflicts) ───────────

export async function PATCH(req: NextRequest, { params }: { params: { workspace: string; id: string } }) {
  const adminRole = await readAdminRole(req.cookies, params.workspace)
  if (!adminRole) return Response.json({ error: 'Forbidden.' }, { status: 403 })

  const body = await req.json()
  const { start_time, end_time, reason } = body as {
    start_time?: string
    end_time?: string
    reason?: string
  }

  const { sendBlockRebookedEmail, sendBlockCancelledEmail } = await import('@/lib/email')

  // ── MOCK_MODE path ────────────────────────────────────────────────────────

  if (process.env.MOCK_MODE === 'true') {
    const { getSessionStore, saveSessionStore } = await import('@/lib/mock/store')
    const store = await getSessionStore()

    const block = store.bookings.find(b => b.id === params.id && b.is_block && !b.cancelled_at)
    if (!block) return Response.json({ error: 'Block not found.' }, { status: 404 })

    const room = store.rooms.find(r => r.id === block.room_id)
    if (!room) return Response.json({ error: 'Room not found.' }, { status: 404 })

    const oldStart = new Date(block.start_time)
    const oldEnd = new Date(block.end_time)
    const newStart = start_time ? new Date(start_time) : oldStart
    const newEnd = end_time ? new Date(end_time) : oldEnd

    if (newEnd.getTime() - newStart.getTime() > 25 * 60 * 60 * 1000) {
      return Response.json({ error: 'A single block can span at most 25 hours — create a separate block for additional days instead of widening this one.' }, { status: 400 })
    }

    // Update block fields
    if (start_time) block.start_time = newStart.toISOString()
    if (end_time) block.end_time = newEnd.toISOString()
    if (reason !== undefined) block.title = reason ?? 'Room unavailable'

    // Detect newly covered slots: time ranges in [newStart, newEnd) that weren't in [oldStart, oldEnd)
    // For simplicity, run conflict detection on the full new range and skip conflicts
    // that were already within the old range (those were already handled at creation time).
    const conflictBookings = store.bookings.filter(b => {
      if (b.cancelled_at || b.is_block || b.room_id !== block.room_id) return false
      const bs = new Date(b.start_time)
      const be = new Date(b.end_time)
      // Only newly-covered slots: overlap new range but NOT old range
      const overlapsNew = overlapsInterval(bs, be, newStart, newEnd)
      const overlapsOld = overlapsInterval(bs, be, oldStart, oldEnd)
      return overlapsNew && !overlapsOld
    })

    const equivalentRooms = store.rooms.filter(
      r => r.is_active && r.room_type === room.room_type && r.id !== room.id
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
        store.bookings.push({
          ...cb,
          id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
          room_id: equivalent.id,
          cancel_token: newToken,
          cancelled_at: null,
          created_at: new Date().toISOString(),
          google_event_id: null,
          is_block: false,
        })
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
    return Response.json({ block, rebooked, cancelled })
  }

  // ── Production path ───────────────────────────────────────────────────────

  const workspaceId = await getWorkspaceId(params.workspace)
  if (!workspaceId) return Response.json({ error: 'Workspace not found.' }, { status: 404 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: block } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', params.id)
    .eq('workspace_id', workspaceId)
    .eq('is_block', true)
    .is('cancelled_at', null)
    .single()
  if (!block) return Response.json({ error: 'Block not found.' }, { status: 404 })

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', block.room_id)
    .single()
  if (!room) return Response.json({ error: 'Room not found.' }, { status: 404 })

  const oldStart = new Date(block.start_time)
  const oldEnd = new Date(block.end_time)
  const newStart = start_time ? new Date(start_time) : oldStart
  const newEnd = end_time ? new Date(end_time) : oldEnd

  if (newEnd.getTime() - newStart.getTime() > 25 * 60 * 60 * 1000) {
    return Response.json({ error: 'A single block can span at most 25 hours — create a separate block for additional days instead of widening this one.' }, { status: 400 })
  }

  // Find newly covered conflicts (overlaps new range but not old) and resolve them
  // before widening the block's time range — the no_overlapping_bookings exclusion
  // constraint applies to any non-cancelled row, so updating the block first would
  // fail while a newly-conflicting booking is still active.
  const { data: candidateConflicts } = await supabase
    .from('bookings')
    .select('*')
    .eq('room_id', block.room_id)
    .eq('workspace_id', workspaceId)
    .eq('is_block', false)
    .is('cancelled_at', null)
    .lt('start_time', newEnd.toISOString())
    .gt('end_time', newStart.toISOString())

  const newConflicts = (candidateConflicts ?? []).filter(cb => {
    const bs = new Date(cb.start_time)
    const be = new Date(cb.end_time)
    return !overlapsInterval(bs, be, oldStart, oldEnd)
  })

  const { data: equivalentRooms } = await supabase
    .from('rooms')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .eq('room_type', room.room_type)
    .neq('id', block.room_id)

  const rebooked: unknown[] = []
  const cancelled: unknown[] = []
  const now = new Date().toISOString()

  for (const cb of newConflicts) {
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

    await supabase.from('bookings').update({ cancelled_at: now }).eq('id', cb.id)

    if (equivalent) {
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

  // Update the block now that newly-conflicting bookings are cancelled/moved
  const patch: Record<string, string> = {}
  if (start_time) patch.start_time = newStart.toISOString()
  if (end_time) patch.end_time = newEnd.toISOString()
  if (reason !== undefined) patch.title = reason ?? 'Room unavailable'

  const { data: updatedBlock, error: patchError } = await supabase
    .from('bookings')
    .update(patch)
    .eq('id', params.id)
    .eq('workspace_id', workspaceId)
    .select()
    .single()
  if (patchError) {
    console.error('[bookings/block/[id] PATCH] update failed:', patchError)
    return Response.json({ error: patchError.details || patchError.message }, { status: 500 })
  }

  return Response.json({ block: updatedBlock, rebooked, cancelled })
}
