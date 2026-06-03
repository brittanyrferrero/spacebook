import type { MockStore } from './store'
import type { Room, Booking, RecurringSeries, Member, CreateBookingPayload, CancelScope } from '@/types'
import { generateOccurrenceDates } from '@/lib/recurring'

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

// ─── Rooms ────────────────────────────────────────────────────────────────────

export function getRooms(store: MockStore): Room[] {
  return store.rooms
    .filter(r => r.is_active)
    .sort((a, b) => a.display_order - b.display_order)
    .map(r => ({ ...r, gcal_connected: !!store.gcalTokens[r.id] }))
}

export function getAllRooms(store: MockStore): Room[] {
  return [...store.rooms]
    .sort((a, b) => a.display_order - b.display_order)
    .map(r => ({ ...r, gcal_connected: !!store.gcalTokens[r.id] }))
}

export function toggleRoom(store: MockStore, id: string): Room | null {
  const room = store.rooms.find(r => r.id === id)
  if (!room) return null
  room.is_active = !room.is_active
  return room
}

export function updateRoom(store: MockStore, id: string, patch: Partial<Pick<Room, 'name' | 'room_type' | 'capacity' | 'amenities' | 'is_active'>>): Room | null {
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
    tablet_token: crypto.randomUUID().replace(/-/g, '').slice(0, 8),
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

export function getBookingsByEmail(store: MockStore, email: string): Booking[] {
  const e = email.toLowerCase().trim()
  return store.bookings
    .filter(b => !b.cancelled_at && b.booker_email.toLowerCase() === e)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
}

export function getBookingsForRange(store: MockStore, from: string, to: string, roomId?: string): Booking[] {
  // Widen by 1 day each side: server runs in UTC but dates are local, so a booking
  // at 11pm local can be midnight UTC "tomorrow". Client filters by local date.
  const fromDate = new Date(from + 'T00:00:00')
  fromDate.setDate(fromDate.getDate() - 1)
  const toDate = new Date(to + 'T23:59:59')
  toDate.setDate(toDate.getDate() + 1)
  return store.bookings.filter(b => {
    if (b.cancelled_at) return false
    if (roomId && b.room_id !== roomId) return false
    const bs = new Date(b.start_time)
    return bs >= fromDate && bs <= toDate
  })
}

export function getBookingsForDate(store: MockStore, date: string, roomId?: string): Booking[] {
  const dayStart = new Date(date + 'T00:00:00')
  dayStart.setDate(dayStart.getDate() - 1)
  const dayEnd = new Date(date + 'T23:59:59')
  dayEnd.setDate(dayEnd.getDate() + 1)
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

export function createBooking(store: MockStore, payload: CreateBookingPayload): { booking?: Booking; series?: RecurringSeries; conflictDates?: string[]; error?: string } {
  const start = new Date(payload.start_time)
  const end = new Date(payload.end_time)

  if (!payload.recurrence) {
    if (hasConflict(store, payload.room_id, start, end)) return { error: 'That time slot is no longer available.' }
    const b: Booking = {
      id: uid(), room_id: payload.room_id, recurring_series_id: null,
      booker_name: payload.booker_name, booker_email: payload.booker_email,
      title: payload.title ?? null, start_time: start.toISOString(), end_time: end.toISOString(),
      cancel_token: token(), google_event_id: null, cancelled_at: null, created_at: new Date().toISOString(),
      origin: payload.origin ?? 'desktop',
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

  const conflictDates: string[] = []
  let firstBooking: Booking | undefined

  for (const occ of occurrences) {
    const occStart = new Date(occ)
    occStart.setHours(start.getHours(), start.getMinutes(), 0, 0)
    const occEnd = new Date(occStart.getTime() + durMs)

    if (hasConflict(store, payload.room_id, occStart, occEnd)) { conflictDates.push(occStart.toISOString().slice(0, 10)); continue }

    const b: Booking = {
      id: uid(), room_id: payload.room_id, recurring_series_id: s.id,
      booker_name: payload.booker_name, booker_email: payload.booker_email,
      title: payload.title ?? null, start_time: occStart.toISOString(), end_time: occEnd.toISOString(),
      cancel_token: token(), google_event_id: null, cancelled_at: null, created_at: new Date().toISOString(),
      origin: payload.origin ?? 'desktop',
    }
    store.bookings.push(b)
    if (!firstBooking) firstBooking = b
  }

  return { booking: firstBooking, series: s, conflictDates }
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
      .filter(b => b.booker_email.toLowerCase() === m.email.toLowerCase())
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    return { ...m, last_used: latest?.created_at ?? null }
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

// ─── Room types ───────────────────────────────────────────────────────────────

export function getRoomTypes(store: MockStore): string[] {
  return [...store.roomTypes].sort()
}

export function addRoomType(store: MockStore, type: string): { types: string[] } | { error: string } {
  if (store.roomTypes.includes(type)) return { error: 'Type already exists.' }
  store.roomTypes.push(type)
  return { types: [...store.roomTypes].sort() }
}

export function deleteRoomType(store: MockStore, type: string): boolean {
  const idx = store.roomTypes.indexOf(type)
  if (idx === -1) return false
  store.roomTypes.splice(idx, 1)
  return true
}

// ─── Amenities ────────────────────────────────────────────────────────────────

export function getAmenityOptions(store: MockStore): string[] {
  return [...(store.amenityOptions ?? [])].sort()
}

export function addAmenityOption(store: MockStore, amenity: string): { amenities: string[] } | { error: string } {
  if (!store.amenityOptions) store.amenityOptions = []
  if (store.amenityOptions.includes(amenity)) return { error: 'Amenity already exists.' }
  store.amenityOptions.push(amenity)
  return { amenities: [...store.amenityOptions].sort() }
}

export function deleteAmenityOption(store: MockStore, amenity: string): boolean {
  if (!store.amenityOptions) return false
  const idx = store.amenityOptions.indexOf(amenity)
  if (idx === -1) return false
  store.amenityOptions.splice(idx, 1)
  for (const room of store.rooms) {
    room.amenities = room.amenities.filter(a => a !== amenity)
  }
  return true
}

// ─── Admin stats ──────────────────────────────────────────────────────────────

export function getAdminStats(store: MockStore, from: string, to: string, roomId?: string, roomType?: string) {
  const fromDate = new Date(from + 'T00:00:00')
  const toDate = new Date(to + 'T23:59:59')

  const allRooms = getAllRooms(store)
  const rooms = roomId
    ? allRooms.filter(r => r.id === roomId)
    : roomType
    ? allRooms.filter(r => r.room_type === roomType)
    : allRooms

  const roomIdSet = new Set(rooms.map(r => r.id))

  const active = store.bookings.filter(b => {
    if (b.cancelled_at) return false
    if (!roomIdSet.has(b.room_id)) return false
    const bs = new Date(b.start_time)
    return bs >= fromDate && bs <= toDate
  })

  const rangeDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1
  const dispStart = store.displayHours?.start ?? 8
  const dispEnd   = store.displayHours?.end   ?? 20
  const bkHrsStart = store.bookingHours?.start ?? 6
  const bkHrsEnd   = store.bookingHours?.end   ?? 22
  const availableDays = (store.countWeekends ?? false) ? rangeDays : (() => {
    let n = 0; const d = new Date(fromDate)
    while (d <= toDate) { const dow = d.getDay(); if (dow !== 0 && dow !== 6) n++; d.setDate(d.getDate() + 1) }
    return n
  })()
  const totalAvailableHoursPerRoom = availableDays * (bkHrsEnd - bkHrsStart)

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
  const hourStats = hourCounts.map((total_bookings, hour) => ({ hour, total_bookings })).filter(h => h.hour >= bkHrsStart && h.hour < bkHrsEnd)

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

  const bkStart = dispStart
  const bkEnd   = dispEnd

  const outsideDisplayHours = active.filter(b => {
    const h = new Date(b.start_time).getHours()
    return h < bkStart || h >= bkEnd
  }).length

  // Day-of-week × hour heatmap
  const dowHourMap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  active.forEach(b => {
    const d = new Date(b.start_time)
    const dow = (d.getDay() + 6) % 7
    dowHourMap[dow][d.getHours()]++
  })
  const dowHourStats: { dow: number; hour: number; count: number }[] = []
  for (let dow = 0; dow < 7; dow++) {
    for (let h = bkStart; h < bkEnd; h++) {
      dowHourStats.push({ dow, hour: h, count: dowHourMap[dow][h] })
    }
  }

  const busiestDate = dailyStats.length > 0
    ? dailyStats.reduce((best, d) => d.total_bookings > best.total_bookings ? d : best)
    : null

  const totalHours = active.reduce((sum, b) => sum + (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 3_600_000, 0)
  const avgDuration = active.length > 0 ? totalHours / active.length : 0
  const totalAvailableHours = totalAvailableHoursPerRoom * rooms.length
  const utilisation = rooms.length > 0 ? Math.min(100, Math.round(totalHours / totalAvailableHours * 100)) : 0

  // Concurrent occupancy: sample every 30 min during booking hours to build a distribution
  const totalRooms = rooms.length
  const concurrentDist: number[] = Array(totalRooms + 1).fill(0)
  let totalSlots = 0
  const dayIter = new Date(fromDate)
  while (dayIter <= toDate) {
    const y = dayIter.getFullYear(), mo = dayIter.getMonth(), dy = dayIter.getDate()
    for (let h = bkStart; h < bkEnd; h++) {
      for (const m of [0, 30]) {
        const slotStart = new Date(y, mo, dy, h, m, 0, 0)
        const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000)
        const occupied = new Set<string>()
        for (const b of active) {
          if (new Date(b.start_time) < slotEnd && new Date(b.end_time) > slotStart) occupied.add(b.room_id)
        }
        concurrentDist[occupied.size]++
        totalSlots++
      }
    }
    dayIter.setDate(dayIter.getDate() + 1)
  }
  let peakConcurrent = 0
  for (let i = concurrentDist.length - 1; i >= 0; i--) { if (concurrentDist[i] > 0) { peakConcurrent = i; break } }
  const highThreshold = Math.max(1, Math.ceil(totalRooms * 0.8))
  const fullSlots = totalRooms > 0 ? (concurrentDist[totalRooms] ?? 0) : 0
  const highSlots = concurrentDist.slice(highThreshold).reduce((s, v) => s + v, 0)
  const concurrentStats = {
    total_rooms: totalRooms,
    total_slots: totalSlots,
    peak_concurrent: peakConcurrent,
    full_pct: totalSlots > 0 ? Math.round(fullSlots / totalSlots * 100) : 0,
    high_demand_pct: totalSlots > 0 ? Math.round(highSlots / totalSlots * 100) : 0,
    distribution: concurrentDist.map((slots, rooms_in_use) => ({ rooms_in_use, slots })),
  }

  const originCounts = { desktop: 0, tablet: 0, gcal: 0 }
  active.forEach(b => {
    const o = (b as any).origin as 'desktop' | 'tablet' | 'gcal' | undefined
    if (o === 'tablet') originCounts.tablet++
    else if (o === 'gcal') originCounts.gcal++
    else originCounts.desktop++
  })
  const total = active.length
  const originStats = {
    desktop: { count: originCounts.desktop, pct: total > 0 ? Math.round(originCounts.desktop / total * 100) : 0 },
    tablet:  { count: originCounts.tablet,  pct: total > 0 ? Math.round(originCounts.tablet  / total * 100) : 0 },
    gcal:    { count: originCounts.gcal,    pct: total > 0 ? Math.round(originCounts.gcal    / total * 100) : 0 },
  }

  return {
    totals: {
      total_bookings: active.length,
      total_hours: Math.round(totalHours * 10) / 10,
      avg_duration: Math.round(avgDuration * 10) / 10,
      utilisation_pct: utilisation,
      outside_display_hours: outsideDisplayHours,
    },
    roomStats,
    hourStats,
    dailyStats,
    dowStats,
    concurrentStats,
    dowHourStats,
    busiestDate,
    originStats,
  }
}
