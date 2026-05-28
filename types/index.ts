export type Amenity = 'TV' | 'Whiteboard' | 'Video conferencing' | 'Phone' | 'Natural light'

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly'

export interface Room {
  id: string
  name: string
  room_type: string | null
  capacity: number
  amenities: Amenity[]
  google_calendar_id: string | null
  gcal_connected?: boolean   // computed — true if OAuth tokens are stored for this room
  tablet_token?: string
  display_order: number
  is_active: boolean
  created_at: string
}

// ─── Recurring series ────────────────────────────────────────────────────────

export interface RecurringSeries {
  id: string
  room_id: string
  booker_name: string
  booker_email: string
  title: string | null
  start_time: string        // HH:MM (time of day)
  end_time: string          // HH:MM (time of day)
  frequency: RecurringFrequency
  days_of_week: number[] | null  // ISO 1=Mon…7=Sun; null for monthly
  series_start: string      // YYYY-MM-DD
  series_end: string        // YYYY-MM-DD
  cancelled_at: string | null
  created_at: string
}

// ─── Bookings ────────────────────────────────────────────────────────────────

export interface Booking {
  id: string
  room_id: string
  recurring_series_id: string | null
  booker_name: string
  booker_email: string
  title: string | null
  start_time: string        // ISO 8601
  end_time: string          // ISO 8601
  cancel_token: string
  google_event_id: string | null
  cancelled_at: string | null
  created_at: string
}

export interface BookingWithRoom extends Booking {
  room: Room
}

// ─── API payloads ────────────────────────────────────────────────────────────

export interface CreateBookingPayload {
  room_id: string
  booker_name: string
  booker_email: string
  title?: string
  start_time: string
  end_time: string
  // If present, creates a recurring series and expands occurrences up to series_end
  recurrence?: {
    frequency: RecurringFrequency
    days_of_week?: number[]   // required for weekly/biweekly
    series_end: string        // YYYY-MM-DD
  }
}

export type CancelScope = 'this' | 'future' | 'all'

export interface CancelBookingPayload {
  scope: CancelScope   // 'this' = just this occurrence; 'future' = this + all after; 'all' = entire series
}

// ─── Members ─────────────────────────────────────────────────────────────────

export interface Member {
  id: string
  name: string
  email: string
  added_at: string
}

// ─── Admin dashboard ─────────────────────────────────────────────────────────

export interface RoomStats {
  room: Room
  total_bookings: number
  total_hours: number
  utilisation_pct: number
}

export interface HourSlotStats {
  hour: number   // 0–23
  total_bookings: number
}

export interface DailyStats {
  date: string   // YYYY-MM-DD
  total_bookings: number
}
