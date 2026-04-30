import type { MockStore } from './store'
import type { Room, Booking, RecurringSeries, Member, CreateBookingPayload, CancelScope, RecurringFrequency } from '@/types'

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const token = () => [uid(), uid()].join('-')

function hasConflict(store: MockStore, roomId: string, start: Date, end: Date, excludeId?: string): boolean {
  return store.bookings.some(b => {
    if (b.id === excludeId || b.room_id !== roomId || b.cancelled_at) return false
    const bs = new Date(b.start_time)
    const be = new Date(b.end_time)
    return start < be && end > bs
  })
}

function nthWeekdayOfMonth(year: number, month: number, jsDay: number, n: number): Date | null {
  const firstDow = new Date(year, month, 1).getDay()
  const firstOccurrence = 1 + ((jsDay - firstDow + 7) % 7)
  const date = firstOccurrence + (n - 1) * 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  if (date > daysInMonth) return null
  return new Date(year, month, date)
}

function generateOccurrenceDates(
  frequency: RecurringFrequency,
  daysOfWeek: number[] | null,
  seriesStart: string,
  seriesEnd: string,
): Date[] {
  const start = new Date(seriesStart + 'T00:00:00')
  const end = new Date(seriesEnd + 'T23:59:59')
  const dates: Date[] = []

  if (frequency === 'monthly') {
    const jsDay = start.getDay()
    const ordinal = Math.ceil(start.getDate() / 7)
    let cur: Date | null = new Date(start)
    while (cur && cur <= end) {
      dates.push(new Date(cur))
      let nextMonth = cur.getMonth() + 1
      let nextYear = cur.getFullYear()
      if (nextMonth > 11) { nextMonth = 0; nextYear++ }
      cur = nthWeekdayOfMonth(nextYear, nextMonth, jsDay, ordinal)
    }
    return dates
  }

  const jsDays = (daysOfWeek ?? []).map(d => (d === 7 ? 0 : d))
  const stepDays = frequency === 'biweekly' ? 14 : 7

  const weekStart = new Date(start)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())

  const week = new Date(weekStart)
  while (week <= end) {
    for (const jsDow of jsDays) {
      const occ = new Date(week)
      occ.setDate(week.getDate() + jsDow)
      if (occ >= start && occ <= end) dates.push(new Date(occ))
    }
    week.setDate(week.getDate() + stepDays)
  }

  return dates.sort((a, b) => a.getTime() - b.getTime())
}

// ─── Rooms ────────────────────────────────────────────────────────────────────

export function getRooms(store: MockStore): Room[] {
  return store.rooms.filter(r => r.is_active).sort((a, b) => a.display_order - b.display_order)
}

export function getAllRooms(store: MockStore): Room[] {
  return [...store.rooms].sort((a, b) => a.display_order - b.display_order)
}

export function toggleRoom(store: MockStore, id: string): Room | null {
  const room = store.rooms.find(r => r.id === id)
  if (!room) return null
  room.is_active = !room.is_active
  return room
}

export function updateRoom(store: MockStore, id: string, patch: Partial<Pick<Room, 'name' | 'capacity' | 'amenities' | 'is_active'>>): Room | null {
  const room = store.rooms.find(r => r.id === id)
  if (!room) return null
  Object.assign(room, patch)
  return room
}

export function createRoom(store: MockStore, data: { name: string; room_type?: string | null; capacity: number; amenities: Room['amenities'] }): Room {
  const room: Room = {
    id: uid(),
    name: data.name,
    room_type: data.room_type ?? null,
    capacity: data.capacity,
    amenities: data.amenities,
    google_calendar_id: null,
    display_order: Math.max(...store.rooms.map(r => r.display_order), 0) + 1,
    is_active: true,
    created_at: new Date().toISOString(),
  }
  store.rooms.push(room)
  return room
}

export function deleteRoom(store: MockStore, id: string): { ok: boolean; hasBookings: boolean } {
  const idx = store.rooms.findIndex(r => r.id === id)
  if (idx === -1) return { ok: false, hasBookings: false }
  const hasBookings = store.bookings.some(b => b.room_id === id && !b.cancelled_at)
  store.rooms.splice(idx, 1)
  return { ok: true, hasBookings }
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export function getBookingsForRange(store: MockStore, from: string, to: string, roomId?: string): Booking[] {
  const fromDate = new Date(from + 'T00:00:00')
  const toDate = new Date(to + 'T23:59:59')
  return store.bookings.filter(b => {
    if (b.cancelled_at) return false
    if (roomId && b.room_id !== roomId) return false
    const bs = new Date(b.start_time)
    return bs >= fromDate && bs <= toDate
  })
}

export function getBookingsForDate(store: MockStore, date: string, roomId?: string): Booking[] {
  const dayStart = new Date(date + 'T00:00:00')
  const dayEnd = new Date(date + 'T23:59:59')
  return store.bookings.filter(b => {
    if (b.cancelled_at) return false
    if (roomId && b.room_id !== roomId) return false
    const bs = new Date(b.start_time)
    return bs >= dayStart && bs <= dayEnd
  })
}

export function getBookingById(store: MockStore, id: string): Booking | null {
  return store.bookings.find(b => b.id === id) ?? null
}

export function getBookingByToken(store: MockStore, token: string): Booking | null {
  return store.bookings.find(b => b.cancel_token === token) ?? null
}

export function updateBooking(store: MockStore, id: string, patch: { title?: string | null; start_time?: string; end_time?: string; booker_name?: string; booker_email?: string }): Booking | null {
  const booking = store.bookings.find(b => b.id === id && !b.cancelled_at)
  if (!booking) return null
  Object.assign(booking, patch)
  return booking
}

export function getSeriesById(store: MockStore, id: string): RecurringSeries | null {
  return store.series.find(s => s.id === id) ?? null
}

export function createBooking(store: MockStore, payload: CreateBookingPayload): { booking?: Booking; series?: RecurringSeries; conflicts?: number; error?: string } {
  const start = new Date(payload.start_time)
  const end = new Date(payload.end_time)

  if (!payload.recurrence) {
    if (hasConflict(store, payload.room_id, start, end)) return { error: 'That time slot is no longer available.' }
    const b: Booking = {
      id: uid(), room_id: payload.room_id, recurring_series_id: null,
      booker_name: payload.booker_name, booker_email: payload.booker_email,
      title: payload.title ?? null, start_time: start.toISOString(), end_time: end.toISOString(),
      cancel_token: token(), google_event_id: null, cancelled_at: null, created_at: new Date().toISOString(),
    }
    store.bookings.push(b)
    return { booking: b }
  }

  const { frequency, days_of_week, series_end } = payload.recurrence
  const seriesStart = start.toISOString().slice(0, 10)
  const padTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

  const s: RecurringSeries = {
    id: uid(), room_id: payload.room_id, booker_name: payload.booker_name,
    booker_email: payload.booker_email, title: payload.title ?? null,
    start_time: padTime(start), end_time: padTime(end),
    frequency, days_of_week: days_of_week ?? null,
    series_start: seriesStart, series_end,
    cancelled_at: null, created_at: new Date().toISOString(),
  }
  store.series.push(s)

  const occurrences = generateOccurrenceDates(frequency, days_of_week ?? null, seriesStart, series_end)
  const durMs = end.getTime() - start.getTime()

  let conflicts = 0
  let firstBooking: Booking | undefined

  for (const occ of occurrences) {
    const occStart = new Date(occ)
    occStart.setHours(start.getHours(), start.getMinutes(), 0, 0)
    const occEnd = new Date(occStart.getTime() + durMs)

    if (hasConflict(store, payload.room_id, occStart, occEnd)) { conflicts++; continue }

    const b: Booking = {
      id: uid(), room_id: payload.room_id, recurring_series_id: s.id,
      booker_name: payload.booker_name, booker_email: payload.booker_email,
      title: payload.title ?? null, start_time: occStart.toISOString(), end_time: occEnd.toISOString(),
      cancel_token: token(), google_event_id: null, cancelled_at: null, created_at: new Date().toISOString(),
    }
    store.bookings.push(b)
    if (!firstBooking) firstBooking = b
  }

  return { booking: firstBooking, series: s, conflicts }
}

export function cancelBooking(store: MockStore, cancelToken: string, scope: CancelScope): { cancelled: number; error?: string } {
  const booking = store.bookings.find(b => b.cancel_token === cancelToken)
  if (!booking) return { cancelled: 0, error: 'Booking not found.' }

  const now = new Date().toISOString()

  if (scope === 'this' || !booking.recurring_series_id) {
    booking.cancelled_at = now
    return { cancelled: 1 }
  }

  const seriesId = booking.recurring_series_id
  const bookingStart = new Date(booking.start_time)

  const toCancel = store.bookings.filter(b => {
    if (b.recurring_series_id !== seriesId || b.cancelled_at) return false
    if (scope === 'all') return true
    return new Date(b.start_time) >= bookingStart
  })

  toCancel.forEach(b => { b.cancelled_at = now })

  if (scope === 'all') {
    const s = store.series.find(s => s.id === seriesId)
    if (s) s.cancelled_at = now
  }

  return { cancelled: toCancel.length }
}

// ─── Members ─────────────────────────────────────────────────────────────────

export function getMembers(store: MockStore): (Member & { last_used: string | null })[] {
  return [...store.members].map(m => {
    const latest = store.bookings
      .filter(b => !b.cancelled_at && b.booker_email.toLowerCase() === m.email.toLowerCase())
      .sort((a, b) => b.start_time.localeCompare(a.start_time))[0]
    return { ...m, last_used: latest?.start_time ?? null }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export function getMemberByEmail(store: MockStore, email: string): Member | null {
  return store.members.find(m => m.email.toLowerCase() === email.toLowerCase()) ?? null
}

export function addMember(store: MockStore, name: string, email: string): { member?: Member; error?: string } {
  if (getMemberByEmail(store, email)) return { error: 'A member with that email already exists.' }
  const member: Member = { id: uid(), name, email, added_at: new Date().toISOString() }
  store.members.push(member)
  return { member }
}

export function updateMember(store: MockStore, id: string, name: string, email: string): { member?: Member; error?: string } {
  const member = store.members.find(m => m.id === id)
  if (!member) return { error: 'Member not found.' }
  const existing = getMemberByEmail(store, email)
  if (existing && existing.id !== id) return { error: 'A member with that email already exists.' }
  member.name = name
  member.email = email
  return { member }
}

export function removeMember(store: MockStore, id: string): boolean {
  const idx = store.members.findIndex(m => m.id === id)
  if (idx === -1) return false
  store.members.splice(idx, 1)
  return true
}

// ─── Admin stats ──────────────────────────────────────────────────────────────

export function getAdminStats(store: MockStore, from: string, to: string, roomId?: string) {
  const fromDate = new Date(from + 'T00:00:00')
  const toDate = new Date(to + 'T23:59:59')

  const active = store.bookings.filter(b => {
    if (b.cancelled_at) return false
    if (roomId && b.room_id !== roomId) return false
    const bs = new Date(b.start_time)
    return bs >= fromDate && bs <= toDate
  })

  const rooms = getAllRooms(store)
  const rangeDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1
  const businessHoursPerDay = 9
  const totalAvailableHoursPerRoom = rangeDays * businessHoursPerDay

  const roomStats = rooms.map(room => {
    const rb = active.filter(b => b.room_id === room.id)
    const hours = rb.reduce((sum, b) => sum + (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 3_600_000, 0)
    return {
      room,
      total_bookings: rb.length,
      total_hours: Math.round(hours * 10) / 10,
      utilisation_pct: Math.min(100, Math.round(hours / totalAvailableHoursPerRoom * 100)),
    }
  })

  const hourCounts: number[] = Array(24).fill(0)
  active.forEach(b => { hourCounts[new Date(b.start_time).getHours()]++ })
  const hourStats = hourCounts.map((total_bookings, hour) => ({ hour, total_bookings })).filter(h => h.hour >= 7 && h.hour <= 18)

  const dailyMap: Record<string, number> = {}
  active.forEach(b => {
    const d = b.start_time.slice(0, 10)
    dailyMap[d] = (dailyMap[d] ?? 0) + 1
  })
  const dailyStats = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, total_bookings]) => ({ date, total_bookings }))

  const dowCounts = Array(7).fill(0)
  active.forEach(b => { dowCounts[(new Date(b.start_time).getDay() + 6) % 7]++ })
  const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const dowStats = dowCounts.map((total_bookings: number, i: number) => ({ dow: i, label: DOW_LABELS[i], total_bookings }))

  const totalHours = active.reduce((sum, b) => sum + (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 3_600_000, 0)
  const avgDuration = active.length > 0 ? totalHours / active.length : 0
  const totalAvailableHours = totalAvailableHoursPerRoom * rooms.length
  const utilisation = Math.min(100, Math.round(totalHours / totalAvailableHours * 100))

  return {
    totals: {
      total_bookings: active.length,
      total_hours: Math.round(totalHours * 10) / 10,
      avg_duration: Math.round(avgDuration * 10) / 10,
      utilisation_pct: utilisation,
    },
    roomStats,
    hourStats,
    dailyStats,
    dowStats,
  }
}
