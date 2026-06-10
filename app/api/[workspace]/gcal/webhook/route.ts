import { type NextRequest } from 'next/server'
import { google } from 'googleapis'

export async function POST(req: NextRequest) {
  const channelId = req.headers.get('x-goog-channel-id')
  const resourceState = req.headers.get('x-goog-resource-state')
  const incomingToken = req.headers.get('x-goog-channel-token')

  // Always return 200 — Google stops sending if it gets repeated non-2xx responses.
  if (!channelId || resourceState === 'sync') return new Response(null, { status: 200 })

  // Verify the webhook token before processing. Look up the stored token for this
  // channel and reject (silently, with 200) if it is missing or doesn't match.
  try {
    const { getRoomIdByChannel, getWatchState } = await import('@/lib/google-calendar/watchStore')
    const roomId = await getRoomIdByChannel(channelId)
    if (roomId) {
      const watchState = await getWatchState(roomId)
      if (!watchState?.webhookToken || watchState.webhookToken !== incomingToken) {
        return new Response(null, { status: 200 })
      }
    }
  } catch { /* non-fatal — fall through and let processWebhook handle any state issues */ }

  try { await processWebhook(channelId) } catch { /* non-fatal */ }

  return new Response(null, { status: 200 })
}

async function processWebhook(channelId: string) {
  const { getRoomIdByChannel, getWatchState, saveWatchState } = await import('@/lib/google-calendar/watchStore')
  const roomId = await getRoomIdByChannel(channelId)
  if (!roomId) return

  const watchState = await getWatchState(roomId)
  if (!watchState) return

  const { getTokens, saveTokens } = await import('@/lib/google-calendar/tokenStore')
  const tokens = await getTokens(roomId)
  if (!tokens) return

  const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_date: tokens.expiry ? new Date(tokens.expiry).getTime() : undefined,
  })
  oauth2Client.on('tokens', async (t) => {
    await saveTokens(roomId, { refresh_token: tokens.refresh_token, access_token: t.access_token ?? undefined, expiry: t.expiry_date ? new Date(t.expiry_date).toISOString() : undefined })
  })

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  // Fetch incremental changes via sync token
  let syncToken = watchState.syncToken
  const changed: any[] = []
  let pageToken: string | undefined

  do {
    let res: any
    try {
      res = await calendar.events.list({
        calendarId: watchState.calendarId,
        syncToken: pageToken ? undefined : syncToken,
        pageToken,
        showDeleted: true,
        singleEvents: true,
      })
    } catch (err: any) {
      if (err?.response?.status === 410) {
        // Sync token expired — reset
        const fresh = await calendar.events.list({ calendarId: watchState.calendarId, maxResults: 1, showDeleted: true, singleEvents: true })
        await saveWatchState(roomId, { ...watchState, syncToken: fresh.data.nextSyncToken ?? syncToken })
      }
      return
    }
    changed.push(...(res.data.items ?? []))
    pageToken = res.data.nextPageToken ?? undefined
    if (!pageToken) syncToken = res.data.nextSyncToken ?? syncToken
  } while (pageToken)

  await saveWatchState(roomId, { ...watchState, syncToken })

  if (changed.length === 0) return

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { workspaceId } = watchState
  const now = new Date().toISOString()
  const nowMs = Date.now()

  const { data: room } = await supabase.from('rooms').select('name, gcal_resource_email').eq('id', roomId).single()

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
      }
      // If already cancelled in spacebook, we triggered this delete — echo, skip
      continue
    }

    // Active event
    if (existing) {
      // We own this booking (spacebook-originated or previously imported) — echo, skip
      continue
    }

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
        sendGcalConflictEmail({
          to: organizerEmail,
          organizerName: event.organizer?.displayName ?? organizerEmail,
          roomName: room?.name ?? 'the room',
          startTime,
          endTime,
          eventTitle: event.summary ?? null,
        }).catch(() => {})
      }
      try { await calendar.events.delete({ calendarId: watchState.calendarId, eventId: googleEventId }) } catch { /* non-fatal */ }
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

    // Patch the GCal event to include the cart resource if not already present
    if (room?.gcal_resource_email) {
      const alreadyPresent = (event.attendees ?? []).some((a: any) => a.email === room.gcal_resource_email)
      if (!alreadyPresent) {
        calendar.events.patch({
          calendarId: watchState.calendarId,
          eventId: googleEventId,
          sendUpdates: 'none',
          requestBody: {
            attendees: [...(event.attendees ?? []), { email: room.gcal_resource_email, resource: true }],
          },
        }).catch(() => {})
      }
    }
  }
}
