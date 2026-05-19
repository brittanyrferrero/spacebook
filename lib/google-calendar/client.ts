import { google } from 'googleapis'
import type { Booking, Room } from '@/types'

async function getAuthClient(roomId: string) {
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
  const event = await calendar.events.insert({
    calendarId: room.google_calendar_id,
    requestBody: {
      summary: booking.title ?? `Booking — ${room.name}`,
      description: `Booked by ${booking.booker_name} (${booking.booker_email})`,
      start: { dateTime: booking.start_time },
      end:   { dateTime: booking.end_time },
    },
  })
  return event.data.id ?? null
}

export async function deleteCalendarEvent(googleEventId: string, calendarId: string, roomId: string): Promise<void> {
  const auth = await getAuthClient(roomId)
  if (!auth) return

  const calendar = google.calendar({ version: 'v3', auth })
  await calendar.events.delete({ calendarId, eventId: googleEventId })
}
