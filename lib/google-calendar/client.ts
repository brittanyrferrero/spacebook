import { google } from 'googleapis'
import type { Booking, Room } from '@/types'

export async function getAuthClient(roomId: string) {
  const { getTokens, saveTokens } = await import('./tokenStore')
  const tokens = await getTokens(roomId)
  if (!tokens) return null

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )

  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_date: tokens.expiry ? new Date(tokens.expiry).getTime() : undefined,
  })

  oauth2Client.on('tokens', async (newTokens) => {
    await saveTokens(roomId, {
      refresh_token: tokens.refresh_token,
      access_token: newTokens.access_token ?? undefined,
      expiry: newTokens.expiry_date ? new Date(newTokens.expiry_date).toISOString() : undefined,
    })
  })

  return oauth2Client
}

export async function createCalendarEvent(booking: Booking, room: Room): Promise<string | null> {
  if (!room.google_calendar_id) return null

  const auth = await getAuthClient(room.id)
  if (!auth) return null

  const calendar = google.calendar({ version: 'v3', auth })
  const attendees: { email: string; displayName?: string; resource?: boolean }[] = [
    { email: booking.booker_email, displayName: booking.booker_name },
    ...(room.gcal_resource_email ? [{ email: room.gcal_resource_email, resource: true }] : []),
  ]
  const event = await calendar.events.insert({
    calendarId: room.google_calendar_id,
    sendUpdates: 'none',
    requestBody: {
      summary: booking.title ?? `Booking — ${room.name}`,
      description: `Booked by ${booking.booker_name} (${booking.booker_email})`,
      start: { dateTime: booking.start_time },
      end:   { dateTime: booking.end_time },
      attendees,
    },
  })
  return event.data.id ?? null
}

export async function updateCalendarEvent(
  googleEventId: string,
  calendarId: string,
  roomId: string,
  booking: { start_time: string; end_time: string; title?: string | null; booker_name: string; booker_email: string },
  roomName: string,
  gcalResourceEmail?: string | null,
): Promise<void> {
  const auth = await getAuthClient(roomId)
  if (!auth) return

  const attendees: { email: string; displayName?: string; resource?: boolean }[] = [
    { email: booking.booker_email, displayName: booking.booker_name },
    ...(gcalResourceEmail ? [{ email: gcalResourceEmail, resource: true }] : []),
  ]
  const calendar = google.calendar({ version: 'v3', auth })
  await calendar.events.patch({
    calendarId,
    eventId: googleEventId,
    sendUpdates: 'none',
    requestBody: {
      summary: booking.title ?? `Booking — ${roomName}`,
      description: `Booked by ${booking.booker_name} (${booking.booker_email})`,
      start: { dateTime: booking.start_time },
      end:   { dateTime: booking.end_time },
      attendees,
    },
  })
}

export async function deleteCalendarEvent(googleEventId: string, calendarId: string, roomId: string): Promise<void> {
  const auth = await getAuthClient(roomId)
  if (!auth) return

  const calendar = google.calendar({ version: 'v3', auth })
  await calendar.events.delete({ calendarId, eventId: googleEventId })
}
