import { google } from 'googleapis'
import type { Booking, Room } from '@/types'
import { getAuthClient, createCalendarEvent } from './client'

// Outbound half of the nightly sync check (the watch check in /api/gcal-renew
// covers Google → spacebook). A booking is written to Google Calendar once, in
// the background, right after it's created. If that write fails — Google error,
// Redis briefly missing the room's tokens, a function cut short — nothing retries
// it, and editing or cancelling the booking later doesn't help either: both only
// touch GCal when `google_event_id` is already set. This finds upcoming bookings
// in connected rooms that never got an event and adds it.

export type ResyncRoom = Pick<Room, 'id' | 'name' | 'google_calendar_id' | 'gcal_resource_email'> & {
  workspaceSlug: string
  workspaceName: string | null
}

export type ResyncRoomResult = {
  roomName: string
  workspaceSlug: string
  workspaceName: string | null
  count: number
  error?: string // first error seen for the room, failures only
}

// Bounded so a big backlog (e.g. old recurring series that never synced) can't
// run the cron into its time limit or Google's rate limit. Soonest bookings go
// first; anything left over is picked up the next night.
export const MAX_PER_RUN = 150
const TIME_BUDGET_MS = 120_000
// The create-time write runs in the background after the API responds; leave
// fresh bookings alone so the cron can't race it and create a second event.
export const GRACE_MS = 15 * 60 * 1000

export async function resyncMissingEvents(rooms: ResyncRoom[]): Promise<{ added: number; adopted: number; fixed: ResyncRoomResult[]; failures: ResyncRoomResult[]; backlog: boolean }> {
  const result = { added: 0, adopted: 0, fixed: [] as ResyncRoomResult[], failures: [] as ResyncRoomResult[], backlog: false }
  const connected = rooms.filter(r => r.google_calendar_id)
  if (connected.length === 0) return result

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const now = Date.now()

  // Room ids go in the request URL, so query in chunks rather than one huge
  // `in (...)`; merge and keep the soonest MAX_PER_RUN + 1 overall.
  const ROOM_CHUNK = 100
  let bookings: Booking[] = []
  for (let i = 0; i < connected.length; i += ROOM_CHUNK) {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .in('room_id', connected.slice(i, i + ROOM_CHUNK).map(r => r.id))
      .is('google_event_id', null)
      .is('cancelled_at', null)
      .eq('is_block', false) // blocked time is deliberately not written to GCal
      .gt('end_time', new Date(now).toISOString())
      .lt('created_at', new Date(now - GRACE_MS).toISOString())
      .order('start_time', { ascending: true })
      .limit(MAX_PER_RUN + 1)
    if (error) {
      console.error('[gcal resync] failed to load bookings missing from GCal', { error })
      continue
    }
    bookings.push(...((data ?? []) as Booking[]))
  }
  bookings = bookings.sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time)).slice(0, MAX_PER_RUN + 1)
  if (bookings.length === 0) return result
  if (bookings.length > MAX_PER_RUN) result.backlog = true

  const roomsById = new Map(connected.map(r => [r.id, r]))
  const fixedByRoom = new Map<string, ResyncRoomResult>()
  const failuresByRoom = new Map<string, ResyncRoomResult>()
  const tally = (map: Map<string, ResyncRoomResult>, room: ResyncRoom, error?: string) => {
    const r = map.get(room.id)
    if (r) r.count++
    else map.set(room.id, { roomName: room.name, workspaceSlug: room.workspaceSlug, workspaceName: room.workspaceName, count: 1, ...(error ? { error } : {}) })
  }
  const calendars = new Map<string, ReturnType<typeof google.calendar> | null>()

  for (const booking of bookings.slice(0, MAX_PER_RUN)) {
    if (Date.now() - now > TIME_BUDGET_MS) { result.backlog = true; break }
    const room = roomsById.get(booking.room_id)
    if (!room) continue

    try {
      if (!calendars.has(room.id)) {
        const auth = await getAuthClient(room.id)
        calendars.set(room.id, auth ? google.calendar({ version: 'v3', auth }) : null)
      }
      const calendar = calendars.get(room.id)
      if (!calendar) throw new Error('no Google tokens for this room')

      // If the original write reached Google but saving the event id failed,
      // the event is already there — adopt it instead of creating a duplicate.
      let eventId = await findExistingEvent(calendar, room.google_calendar_id!, booking)
      const adopted = !!eventId
      if (!eventId) eventId = await createCalendarEvent(booking, room)
      if (!eventId) throw new Error('Google returned no event id')

      const { error: saveError } = await supabase.from('bookings').update({ google_event_id: eventId }).eq('id', booking.id)
      if (saveError) throw new Error(`event ${adopted ? 'found' : 'created'} but saving its id failed: ${saveError.message}`)

      if (adopted) result.adopted++; else result.added++
      tally(fixedByRoom, room)
      console.warn('[gcal resync] added missing GCal event', { bookingId: booking.id, roomId: room.id, roomName: room.name, adopted })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[gcal resync] failed to add missing GCal event', { bookingId: booking.id, roomId: room.id, err })
      tally(failuresByRoom, room, message)
    }
  }

  if (result.backlog) console.warn('[gcal resync] more bookings missing from GCal than one run handles; continuing tomorrow', { limit: MAX_PER_RUN })
  result.fixed = [...fixedByRoom.values()]
  result.failures = [...failuresByRoom.values()]
  return result
}

async function findExistingEvent(calendar: ReturnType<typeof google.calendar>, calendarId: string, booking: Booking): Promise<string | null> {
  const res = await calendar.events.list({
    calendarId,
    timeMin: booking.start_time,
    timeMax: booking.end_time,
    singleEvents: true,
    maxResults: 50,
  })
  const description = `Booked by ${booking.booker_name} (${booking.booker_email})`
  const start = Date.parse(booking.start_time)
  const end = Date.parse(booking.end_time)
  const match = (res.data.items ?? []).find(e =>
    e.status !== 'cancelled' &&
    e.description === description &&
    Date.parse(e.start?.dateTime ?? '') === start &&
    Date.parse(e.end?.dateTime ?? '') === end,
  )
  return match?.id ?? null
}
