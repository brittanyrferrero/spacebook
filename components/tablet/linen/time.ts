import type { Booking } from '@/types'

// Pure date/status helpers for the Linen tablet display. Kept separate from the
// Classic display's copies on purpose — Classic stays untouched (ADR-021).

export const DAYS_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAYS_LONG   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const MONTHS      = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const pad = (n: number) => String(n).padStart(2, '0')
export const dateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export function isoMonday(d: Date): Date {
  const dow = d.getDay()
  return addDays(startOfDay(d), -(dow === 0 ? 6 : dow - 1))
}

/** Hours since midnight as a decimal, e.g. 10:42 → 10.7 */
export const decHours = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600

/** 12-hour clock without am/pm, e.g. "10:42", "1:05" */
export function fmtClock(d: Date): string {
  return `${d.getHours() % 12 || 12}:${pad(d.getMinutes())}`
}

export function fmtHour(h: number, short = false): string {
  const suffix = h >= 12 && h < 24 ? (short ? 'p' : 'pm') : (short ? 'a' : 'am')
  return `${h % 12 || 12}${suffix}`
}

/** "48 minutes", "1 hr", "1 hr 58 min" */
export function fmtDur(mins: number): string {
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'}`
  const h = Math.floor(mins / 60), m = mins % 60
  return `${h} hr${m ? ` ${m} min` : ''}`
}

export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** "HH:MM" one hour after the given "HH:MM", capped at 23:00 (same rule as Classic). */
export function hourAfter(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const total = Math.min(h * 60 + m + 60, 23 * 60)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

export const isActive = (b: Booking) => !b.cancelled_at

export interface RoomStatus {
  current: Booking | null   // booking in progress right now
  next: Booking | null      // next booking starting later today
  /** Whole minutes until `next` starts (free), or until `current` ends (busy). null = nothing else today. */
  minutes: number | null
}

/** Status of one room at `now`, from that room's bookings for today. */
export function roomStatus(bookings: Booking[], now: Date): RoomStatus {
  const active = bookings.filter(isActive)
  const current = active.find(b => new Date(b.start_time) <= now && new Date(b.end_time) > now) ?? null
  const endOfToday = addDays(startOfDay(now), 1)
  // Only today counts: "free until 9:00" must never mean 9:00 tomorrow
  const next = active
    .filter(b => new Date(b.start_time) > now && new Date(b.start_time) < endOfToday)
    .sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time))[0] ?? null
  const target = current ? current.end_time : next?.start_time
  const minutes = target ? Math.max(0, Math.ceil((+new Date(target) - +now) / 60000)) : null
  return { current, next, minutes }
}

/** True if a walk-in from `now` for `mins` would overlap any booking. */
export function durationConflicts(bookings: Booking[], now: Date, mins: number): boolean {
  const end = new Date(now.getTime() + mins * 60000)
  return bookings.some(b => isActive(b) && new Date(b.start_time) < end && new Date(b.end_time) > now)
}

/** What a calendar block says: respects the workspace's "show titles" setting. */
export function blockLabel(b: Booking, showTitle: boolean): string {
  if (b.is_block) return b.title || 'Unavailable'
  if (!showTitle) return 'Occupied'
  return `${b.recurring_series_id ? '↻ ' : ''}${b.title || 'Occupied'}`
}

/** Month grid starting on Monday: every date shown, row count. */
export function monthGrid(viewDate: Date): { first: Date; days: Date[]; rows: number } {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const lead = (first.getDay() + 6) % 7
  const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const rows = Math.ceil((lead + dim) / 7)
  const days = Array.from({ length: rows * 7 }, (_, i) => addDays(first, i - lead))
  return { first, days, rows }
}
