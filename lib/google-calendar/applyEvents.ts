import type { calendar_v3 } from 'googleapis'

export type ApplyResult = { imported: number; cancelled: number }

// Mirrors Google Calendar event changes into spacebook bookings for one room.
// Used by the push webhook (incremental changes) and by the self-heal catch-up
// in registerWatch (changes made while the room's watch channel was lost).
//   - cancelled event  → cancel the matching active booking
//   - new external event → import it, or delete it from GCal and email the
//     organizer if it conflicts with an existing booking
//   - event we already have → skip (echo of our own write)
export async function applyCalendarEvents(args: {
  roomId: string
  workspaceId: string
  calendarId: string
  calendar: calendar_v3.Calendar
  events: any[]
}): Promise<ApplyResult> {
  const { roomId, workspaceId, calendarId, calendar, events: changed } = args
  const result: ApplyResult = { imported: 0, cancelled: 0 }
  if (changed.length === 0) return result

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const now = new Date().toISOString()
  const nowMs = Date.now()

  const { data: room } = await supabase.from('rooms').select('name, gcal_resource_email, is_active').eq('id', roomId).single()

  for (const event of changed) {
    const googleEventId: string = event.id

    // Find existing spacebook booking for this event
    const { data: existing } = await supabase
      .from('bookings')
      .select('id, cancelled_at')
      .eq('google_event_id', googleEventId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (event.status === 'cancelled') {
      // Deleted from GCal externally — cancel the spacebook booking if it's still active
      if (existing && !existing.cancelled_at) {
        await supabase.from('bookings').update({ cancelled_at: now }).eq('id', existing.id)
        result.cancelled++
      }
      // If already cancelled in spacebook, we triggered this delete — echo, skip
      continue
    }

    // Active event
    if (existing) {
      // We own this booking (spacebook-originated or previously imported) — echo, skip
      continue
    }

    // Room is disabled — don't mirror new external events into spacebook, leave the GCal event alone
    if (!room?.is_active) continue

    // New external event — determine start/end
    let startTime: string, endTime: string
    if (event.start?.dateTime) {
      startTime = event.start.dateTime
      endTime = event.end?.dateTime ?? startTime
    } else if (event.start?.date) {
      // All-day event — block 9am–5pm on that day
      startTime = `${event.start.date}T09:00:00`
      endTime = `${event.start.date}T17:00:00`
    } else {
      continue
    }

    // Skip past events
    if (new Date(endTime).getTime() < nowMs) continue

    // Check for conflict with existing spacebook bookings
    const { data: conflicts } = await supabase
      .from('bookings')
      .select('id')
      .eq('room_id', roomId)
      .eq('workspace_id', workspaceId)
      .is('cancelled_at', null)
      .lt('start_time', endTime)
      .gt('end_time', startTime)

    if (conflicts && conflicts.length > 0) {
      // Delete the GCal event and email the organizer
      const organizerEmail = event.organizer?.email
      if (organizerEmail) {
        const { sendGcalConflictEmail } = await import('@/lib/email')
        const { workspaceTimeZone } = await import('@/lib/time-zone')
        sendGcalConflictEmail({
          timeZone: await workspaceTimeZone(workspaceId),
          to: organizerEmail,
          organizerName: event.organizer?.displayName ?? organizerEmail,
          roomName: room?.name ?? 'the room',
          startTime,
          endTime,
          eventTitle: event.summary ?? null,
        }).catch(() => {})
      }
      try { await calendar.events.delete({ calendarId: calendarId, eventId: googleEventId }) } catch { /* non-fatal */ }
      continue
    }

    // Try to match organizer to a spacebook member
    const organizerEmail = event.organizer?.email ?? 'gcal@external'
    const { data: member } = await supabase
      .from('members')
      .select('name, email')
      .eq('workspace_id', workspaceId)
      .ilike('email', organizerEmail)
      .maybeSingle()

    await supabase.from('bookings').insert({
      room_id: roomId,
      workspace_id: workspaceId,
      booker_name: member?.name ?? event.organizer?.displayName ?? 'Google Calendar',
      booker_email: member?.email ?? organizerEmail,
      title: event.summary ?? null,
      start_time: startTime,
      end_time: endTime,
      google_event_id: googleEventId,
      origin: 'gcal',
    })
    result.imported++

    // Patch the GCal event to include the cart resource if not already present
    if (room?.gcal_resource_email) {
      const alreadyPresent = (event.attendees ?? []).some((a: any) => a.email === room.gcal_resource_email)
      if (!alreadyPresent) {
        calendar.events.patch({
          calendarId: calendarId,
          eventId: googleEventId,
          sendUpdates: 'none',
          requestBody: {
            attendees: [...(event.attendees ?? []), { email: room.gcal_resource_email, resource: true }],
          },
        }).catch((err: any) => {
          console.error('[gcal cart-attach] failed to add cart resource to inbound event', {
            roomId, googleEventId,
            status: err?.response?.status,
            googleError: err?.response?.data?.error?.message ?? err?.message,
          })
        })
      }
    }
  }

  return result
}
