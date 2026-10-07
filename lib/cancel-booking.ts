import type { SupabaseClient } from '@supabase/supabase-js'
import type { BookingWithRoom, CancelScope } from '@/types'
import { notifyRequesters } from '@/lib/booking-requests'

/** Cancels one booking, or it and the rest of its series ('future'). Deletes
 *  the Google Calendar events and tells anyone who asked about these bookings
 *  that the time is free. Shared by the emailed cancel link and the in-app
 *  cancel route, so both behave the same. */
export async function cancelBookingRows(
  supabase: SupabaseClient,
  booking: BookingWithRoom,
  scope: CancelScope,
  timeZone?: string | null,
): Promise<{ cancelled: number; error?: string }> {
  const now = new Date().toISOString()

  let rows: { id: string; google_event_id: string | null; start_time: string; end_time: string; booker_name: string }[] = [booking]
  if (scope === 'future' && booking.recurring_series_id) {
    const { data } = await supabase
      .from('bookings')
      .select('id, google_event_id, start_time, end_time, booker_name')
      .eq('recurring_series_id', booking.recurring_series_id)
      .gte('start_time', booking.start_time)
      .is('cancelled_at', null)
    rows = data ?? []
    if (rows.length === 0) return { cancelled: 0 }
  }

  const { error } = await supabase.from('bookings').update({ cancelled_at: now }).in('id', rows.map(r => r.id))
  if (error) return { cancelled: 0, error: error.message }

  const room = booking.room
  const toDelete = rows.filter(r => r.google_event_id)
  if (toDelete.length > 0 && room?.google_calendar_id) {
    const { deleteCalendarEvent } = await import('@/lib/google-calendar/client')
    Promise.all(toDelete.map(r => deleteCalendarEvent(r.google_event_id!, room.google_calendar_id!, room.id))).catch(() => {})
  }

  await Promise.all(rows.map(r => notifyRequesters(r, room?.name ?? '', 'cancelled', timeZone)))

  return { cancelled: rows.length }
}
