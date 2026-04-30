import { google } from 'googleapis'
import type { Booking, Room } from '@/types'

function getAuthClient() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })
}

export async function createCalendarEvent(booking: Booking, room: Room): Promise<string | null> {
  if (!room.google_calendar_id) return null

  const auth = getAuthClient()
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

export async function deleteCalendarEvent(googleEventId: string, calendarId: string): Promise<void> {
  const auth = getAuthClient()
  const calendar = google.calendar({ version: 'v3', auth })

  await calendar.events.delete({ calendarId, eventId: googleEventId })
}
