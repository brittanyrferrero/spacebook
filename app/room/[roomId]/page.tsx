'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Room, Booking } from '@/types'
import { NameAutocomplete } from '@/components/NameAutocomplete'

// ─── Colours ──────────────────────────────────────────────────────────────────
const SAGE = '#5C7A6B'
const NAVY = '#2C3E6B'
const ROSE = '#db95ab'          // user accent — Book Now + selected day
const FREE_BG = '#E8F4EC'; const FREE_TEXT = '#1E5C30'; const FREE_BAR = '#3B7A4A'
const BUSY_BG = '#e8ecf2'; const BUSY_TEXT = '#213452'; const BUSY_BAR = '#213452'

// ─── Calendar constants ───────────────────────────────────────────────────────
const GRID_START = 8            // 8 am
const GRID_END   = 19           // 7 pm
const GRID_HOURS = GRID_END - GRID_START
const HOUR_H     = 38           // px per hour in week view
const GRID_H     = GRID_HOURS * HOUR_H

const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_LONG    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DAYS_SHORT   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']  // ISO Mon-first

// ─── Date helpers ─────────────────────────────────────────────────────────────
const dateStr = (d: Date) => d.toISOString().slice(0, 10)

function isoMonday(d: Date): Date {
  const copy = new Date(d)
  const dow = copy.getDay()                // 0=Sun … 6=Sat
  copy.setDate(copy.getDate() - (dow === 0 ? 6 : dow - 1))
  copy.setHours(0, 0, 0, 0)
  return copy
}

function getWeekDays(ref: Date): Date[] {
  const mon = isoMonday(ref)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d
  })
}

function getMonthCalendar(ref: Date): Date[][] {
  const y = ref.getFullYear(), m = ref.getMonth()
  const first = new Date(y, m, 1)
  const last  = new Date(y, m + 1, 0)
  const calStart = isoMonday(first)
  const weeks: Date[][] = []
  const cur = new Date(calStart)
  while (cur <= last || weeks.length < 5) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
    weeks.push(week)
    if (cur > last && weeks.length >= 5) break
  }
  return weeks
}

function fmt12(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function toHHMM(d: Date) {
  const totalMins = d.getHours() * 60 + d.getMinutes()
  const snapped = Math.round(totalMins / 15) * 15
  return `${String(Math.floor(snapped / 60) % 24).padStart(2, '0')}:${String(snapped % 60).padStart(2, '0')}`
}

function toHHMMExact(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}


// ─── Status helpers ───────────────────────────────────────────────────────────
function getRoomStatus(bookings: Booking[]) {
  const now = new Date()
  const active = bookings.filter(b => !b.cancelled_at)
  const current = active.find(b => new Date(b.start_time) <= now && new Date(b.end_time) > now)
  if (current) return { status: 'busy' as const, until: fmt12(current.end_time) }
  const next = active.filter(b => new Date(b.start_time) > now).sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time))[0]
  return { status: 'free' as const, until: next ? fmt12(next.start_time) : 'end of day' }
}


// Fractional hour position within the time grid
function toGridPct(h: number, m: number) {
  return ((h - GRID_START) + m / 60) / GRID_HOURS
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7)   // 7–23
const MINS  = [0, 15, 30, 45]

function fmtHour(h: number) {
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function ordinal(n: number) { return ['1st','2nd','3rd','4th','5th'][n - 1] ?? `${n}th` }

function TimePicker({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties }) {
  const [rawH, rawM] = value ? value.split(':') : ['', '']
  const selH = rawH ?? ''
  const selM = rawM ?? ''
  const sel: React.CSSProperties = { fontSize: 14, padding: '8px 6px', border: '0.5px solid #C8CDD4', borderRadius: 8, outline: 'none', fontFamily: 'inherit', flex: 1, background: '#fff', cursor: 'pointer', ...style }
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <select style={sel} value={selH} onChange={e => onChange(`${e.target.value}:${selM || '00'}`)}>
        <option value="" disabled>HH</option>
        {HOURS.map(h => <option key={h} value={String(h).padStart(2,'0')}>{fmtHour(h)}</option>)}
      </select>
      <select style={sel} value={selM} onChange={e => onChange(`${selH || '09'}:${e.target.value}`)}>
        <option value="" disabled>MM</option>
        {MINS.map(m => <option key={m} value={String(m).padStart(2,'0')}>{String(m).padStart(2,'0')}</option>)}
      </select>
    </div>
  )
}

function NowLine({ now }: { now: Date }) {
  const pct = toGridPct(now.getHours(), now.getMinutes())
  if (pct < 0 || pct > 1) return null
  const top = pct * GRID_H
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, zIndex: 3, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: -5, top: -5, width: 10, height: 10, borderRadius: '50%', background: ROSE }} />
      <div style={{ height: 2, background: ROSE, opacity: 0.85 }} />
    </div>
  )
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

function DayView({ bookings, viewDate, onSlotClick, onBookingClick, pendingSlot, now }: {
  bookings: Booking[];
  viewDate: Date;
  onSlotClick?: (date: Date, time: string) => void;
  onBookingClick?: (b: Booking) => void;
  pendingSlot?: { ds: string; startHHMM: string; endHHMM: string } | null;
  now?: Date;
}) {
  const ds = dateStr(viewDate)
  const todayDs = now ? dateStr(now) : dateStr(new Date())
  const isPast = ds < todayDs
  const activeBookings = bookings.filter(b => !b.cancelled_at)
  const hourLabels = Array.from({ length: GRID_HOURS + 1 }, (_, i) => {
    const h = GRID_START + i
    return h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
  })

  return (
    <div style={{ display: 'flex', overflow: 'visible' }}>
      {/* Hour axis */}
      <div style={{ flexShrink: 0, width: 38, position: 'relative', height: GRID_H }}>
        {hourLabels.map((label, i) => (
          <div key={label} style={{ position: 'absolute', top: Math.max(0, i * HOUR_H - 7), right: 4, fontSize: 9, color: '#6B7280', textAlign: 'right', whiteSpace: 'nowrap' }}>{label}</div>
        ))}
      </div>

      {/* Time grid */}
      <div style={{ flex: 1, borderLeft: '0.5px solid #E8E8E8' }}>
        <div
          style={{ position: 'relative', height: GRID_H, cursor: onSlotClick ? 'pointer' : 'default' }}
          onClick={onSlotClick ? (e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const y = e.clientY - rect.top
            const fracHours = (Math.max(0, Math.min(y, GRID_H)) / GRID_H) * GRID_HOURS
            const totalMins = Math.round((GRID_START * 60 + fracHours * 60) / 15) * 15
            const h = Math.min(Math.floor(totalMins / 60), GRID_END - 1)
            const m = totalMins % 60
            onSlotClick(viewDate, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
          } : undefined}>
          {/* Hour bands + grid lines */}
          {Array.from({ length: GRID_HOURS }, (_, i) => (
            <div key={i} style={{ position: 'absolute', top: i * HOUR_H, left: 0, right: 0, height: HOUR_H, background: i % 2 === 0 ? 'rgba(0,0,0,0.018)' : 'transparent', borderTop: `0.5px solid ${isPast ? '#ECECEC' : '#C4C4C4'}` }} />
          ))}

          {/* Ghost pending block */}
          {pendingSlot?.ds === ds && (() => {
            const [sh, sm] = pendingSlot.startHHMM.split(':').map(Number)
            const [eh, em] = pendingSlot.endHHMM.split(':').map(Number)
            const topPx    = Math.max(0, toGridPct(sh, sm) * GRID_H)
            const heightPx = Math.max(8, (toGridPct(eh, em) - toGridPct(sh, sm)) * GRID_H)
            return <div style={{ position: 'absolute', top: topPx, left: 2, right: 2, height: heightPx, background: 'rgba(148,163,184,0.25)', borderRadius: 4, border: '1.5px dashed #94A3B8', pointerEvents: 'none' }} />
          })()}

          {/* Current time line */}
          {now && dateStr(viewDate) === dateStr(now) && <NowLine now={now} />}

          {/* Booking blocks */}
          {activeBookings.map(b => {
            const bs = new Date(b.start_time), be = new Date(b.end_time)
            const topPx    = Math.max(0, toGridPct(bs.getHours(), bs.getMinutes()) * GRID_H)
            const heightPx = Math.max(16, (toGridPct(be.getHours(), be.getMinutes()) - toGridPct(bs.getHours(), bs.getMinutes())) * GRID_H)
            const isPast   = now ? be < now : false
            const blockBg     = isPast ? '#e4e6ea' : '#c8d2e0'
            const blockBorder = isPast ? '#adb5bd' : BUSY_BAR
            const blockText   = isPast ? '#9ca3af' : BUSY_BAR
            return (
              <div key={b.id}
                onClick={e => { e.stopPropagation(); onBookingClick?.(b) }}
                style={{ position: 'absolute', top: topPx, left: 4, right: 4, height: heightPx, background: blockBg, borderRadius: 4, cursor: onBookingClick ? 'pointer' : 'default', borderLeft: `3px solid ${blockBorder}`, overflow: 'hidden' }}>
                {heightPx > 18 && <div style={{ padding: '2px 5px', fontSize: 10, color: blockText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{b.recurring_series_id ? `↻ ${b.booker_name}` : b.booker_name}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WeekView({ bookings, weekDays, onSlotClick, onBookingClick, pendingSlot, now }: { bookings: Booking[]; weekDays: Date[]; onSlotClick?: (date: Date, time: string) => void; onBookingClick?: (b: Booking) => void; pendingSlot?: { ds: string; startHHMM: string; endHHMM: string } | null; now?: Date }) {
  const todayStr = dateStr(new Date())
  const byDay: Record<string, Booking[]> = {}
  for (const b of bookings) {
    const d = b.start_time.slice(0, 10)
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(b)
  }

  const hourLabels = Array.from({ length: GRID_HOURS + 1 }, (_, i) => {
    const h = GRID_START + i
    return h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
  })

  return (
    <div>
      {/* Day headers — outside scroll container so they never overlap the grid */}
      <div style={{ display: 'flex', marginLeft: 38, borderLeft: '0.5px solid #E8E8E8' }}>
        {weekDays.map((day, colIdx) => {
          const ds = dateStr(day)
          const isToday = ds === todayStr
          return (
            <div key={ds} style={{ flex: 1, textAlign: 'center', padding: '6px 0 8px', borderRight: colIdx < 6 ? '0.5px solid #F0F0EE' : 'none' }}>
              <div style={{ fontSize: 10, color: isToday ? ROSE : '#9CA3AF', fontWeight: isToday ? 600 : 400 }}>{DAYS_SHORT[colIdx]}</div>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: isToday ? ROSE : 'transparent', color: isToday ? '#fff' : '#374151', fontSize: 12, fontWeight: isToday ? 600 : 400, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px auto 0' }}>
                {day.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scrollable time grid */}
      <div style={{ display: 'flex', overflow: 'auto', maxHeight: GRID_H + 16 }}>
        {/* Hour axis */}
        <div style={{ flexShrink: 0, width: 38, position: 'relative', height: GRID_H }}>
          {hourLabels.map((label, i) => (
            <div key={label} style={{ position: 'absolute', top: Math.max(0, i * HOUR_H - 7), right: 4, fontSize: 9, color: '#6B7280', textAlign: 'right', whiteSpace: 'nowrap' }}>{label}</div>
          ))}
        </div>

        {/* Day columns */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, 1fr)`, flex: 1, borderLeft: '0.5px solid #E8E8E8' }}>
          {weekDays.map((day, colIdx) => {
            const ds = dateStr(day)
            const isToday = ds === todayStr
            const dayBookings = (byDay[ds] ?? []).filter(b => !b.cancelled_at)
            return (
              <div key={ds} style={{ borderRight: colIdx < 6 ? '0.5px solid #F0F0EE' : 'none' }}>
                <div
                  style={{ position: 'relative', height: GRID_H, background: isToday ? 'rgba(212,155,169,0.04)' : 'transparent', cursor: onSlotClick ? 'pointer' : 'default' }}
                  onClick={onSlotClick ? (e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const y = e.clientY - rect.top
                    const fracHours = (Math.max(0, Math.min(y, GRID_H)) / GRID_H) * GRID_HOURS
                    const totalMins = Math.round((GRID_START * 60 + fracHours * 60) / 15) * 15
                    const h = Math.min(Math.floor(totalMins / 60), GRID_END - 1)
                    const m = totalMins % 60
                    onSlotClick(day, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
                  } : undefined}>
                  {/* Hour bands + grid lines */}
                  {Array.from({ length: GRID_HOURS }, (_, i) => (
                    <div key={i} style={{ position: 'absolute', top: i * HOUR_H, left: 0, right: 0, height: HOUR_H, background: i % 2 === 0 ? 'rgba(0,0,0,0.018)' : 'transparent', borderTop: '0.5px solid #ECECEC' }} />
                  ))}

                  {/* Pending booking ghost */}
                  {pendingSlot?.ds === ds && (() => {
                    const [sh, sm] = pendingSlot.startHHMM.split(':').map(Number)
                    const [eh, em] = pendingSlot.endHHMM.split(':').map(Number)
                    const topPx    = Math.max(0, toGridPct(sh, sm) * GRID_H)
                    const heightPx = Math.max(8, (toGridPct(eh, em) - toGridPct(sh, sm)) * GRID_H)
                    return <div style={{ position: 'absolute', top: topPx, left: 2, right: 2, height: heightPx, background: 'rgba(148,163,184,0.25)', borderRadius: 4, border: '1.5px dashed #94A3B8', pointerEvents: 'none' }} />
                  })()}

                  {/* Current time line */}
                  {now && isToday && <NowLine now={now} />}

                  {/* Booking blocks */}
                  {dayBookings.map(b => {
                    const bs = new Date(b.start_time), be = new Date(b.end_time)
                    const topPx    = Math.max(0, toGridPct(bs.getHours(), bs.getMinutes()) * GRID_H)
                    const heightPx = Math.max(16, (toGridPct(be.getHours(), be.getMinutes()) - toGridPct(bs.getHours(), bs.getMinutes())) * GRID_H)
                    const isPast   = now ? be < now : false
                    const blockBg     = isPast ? '#e4e6ea' : '#c8d2e0'
                    const blockBorder = isPast ? '#adb5bd' : BUSY_BAR
                    const blockText   = isPast ? '#9ca3af' : BUSY_BAR
                    return (
                      <div key={b.id}
                        onClick={e => { e.stopPropagation(); onBookingClick?.(b) }}
                        style={{ position: 'absolute', top: topPx, left: 2, right: 2, height: heightPx, background: blockBg, borderRadius: 4, cursor: onBookingClick ? 'pointer' : 'default', borderLeft: `3px solid ${blockBorder}`, overflow: 'hidden' }}>
                        {heightPx > 18 && <div style={{ padding: '2px 4px', fontSize: 9, color: blockText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{b.recurring_series_id ? `↻ ${b.booker_name}` : b.booker_name}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MonthView({ bookings, viewDate, onDayClick }: { bookings: Booking[]; viewDate: Date; onDayClick: (d: Date) => void }) {
  const todayStr   = dateStr(new Date())
  const viewMonth  = viewDate.getMonth()
  const weeks      = getMonthCalendar(viewDate)

  const byDay: Record<string, number> = {}
  for (const b of bookings) {
    if (b.cancelled_at) continue
    const d = b.start_time.slice(0, 10)
    byDay[d] = (byDay[d] ?? 0) + 1
  }

  return (
    <div>
      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
        {DAYS_SHORT.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: '#9CA3AF', fontWeight: 500, paddingBottom: 4 }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderTop: '0.5px solid #F0F0EE' }}>
          {week.map((day, di) => {
            const ds = dateStr(day)
            const inMonth  = day.getMonth() === viewMonth
            const isToday  = ds === todayStr
            const count    = byDay[ds] ?? 0

            return (
              <div key={ds} onClick={() => onDayClick(day)}
                style={{ padding: '6px 4px 8px', minHeight: 52, cursor: 'pointer', borderRight: di < 6 ? '0.5px solid #F0F0EE' : 'none', background: isToday ? 'rgba(212,155,169,0.07)' : 'transparent', transition: 'background .1s' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday ? ROSE : 'transparent', color: isToday ? '#fff' : inMonth ? '#374151' : '#C8CDD4', fontSize: 11, fontWeight: isToday ? 600 : 400 }}>
                    {day.getDate()}
                  </div>
                </div>
                {count > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
                    {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                      <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#E0B0B2' }} />
                    ))}
                    {count > 3 && <div style={{ fontSize: 8, color: '#9CA3AF', lineHeight: '5px' }}>+{count - 3}</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type CalView = 'day' | 'week' | 'month'

export default function RoomDisplayPage({ params }: { params: { roomId: string } }) {
  const [room,         setRoom]         = useState<Room | null>(null)
  const [todayBkgs,   setTodayBkgs]    = useState<Booking[]>([])   // always today — for status band
  const [rangeBkgs,   setRangeBkgs]    = useState<Booking[]>([])   // current view range
  const [now,          setNow]          = useState(new Date())
  const [calView,      setCalView]      = useState<CalView>('day')
  const [viewDate,     setViewDate]     = useState(new Date())

  // Modal state
  const [showModal,  setShowModal]  = useState<'now' | 'later' | null>(null)
  const [mName,      setMName]      = useState('')
  const [mEmail,     setMEmail]     = useState('')
  const [mTitle,     setMTitle]     = useState('')
  const [mDate,      setMDate]      = useState(() => new Date().toISOString().slice(0, 10))
  const [mTime,      setMTime]      = useState('')
  const [mEndTime,   setMEndTime]   = useState('')
  const [mSubmitting,setMSubmitting]= useState(false)
  const [mDone,      setMDone]      = useState(false)
  const [recurFreq,  setRecurFreq]  = useState<'none' | 'weekly' | 'monthly'>('none')
  const [recurUntil, setRecurUntil] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 3); return d.toISOString().slice(0, 10) })

  // Edit existing booking
  const [editBooking,    setEditBooking]    = useState<Booking | null>(null)
  const [editTitle,      setEditTitle]      = useState('')
  const [editName,       setEditName]       = useState('')
  const [editEmail,      setEditEmail]      = useState('')
  const [editDate,       setEditDate]       = useState('')
  const [editStart,      setEditStart]      = useState('')
  const [editEnd,        setEditEnd]        = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  const todayStr    = now.toISOString().slice(0, 10)
  const viewDateStr = dateStr(viewDate)
  const weekDays    = getWeekDays(viewDate)

  // Compute fetch range for each view
  function getRange(): { from: string; to: string } {
    if (calView === 'day')   return { from: viewDateStr, to: viewDateStr }
    if (calView === 'week')  return { from: dateStr(weekDays[0]), to: dateStr(weekDays[6]) }
    // month
    const y = viewDate.getFullYear(), m = viewDate.getMonth()
    return { from: dateStr(new Date(y, m, 1)), to: dateStr(new Date(y, m + 1, 0)) }
  }

  const fetchRoom = useCallback(() => {
    fetch('/api/rooms').then(r => r.json()).then((rooms: Room[]) => {
      setRoom(rooms.find(r => r.id === params.roomId) ?? rooms[0] ?? null)
    })
  }, [params.roomId])

  const fetchToday = useCallback(() => {
    fetch(`/api/bookings?room_id=${params.roomId}&date=${todayStr}`)
      .then(r => r.json()).then(setTodayBkgs)
  }, [params.roomId, todayStr])

  const fetchRange = useCallback(() => {
    const { from, to } = getRange()
    fetch(`/api/bookings?room_id=${params.roomId}&from=${from}&to=${to}`)
      .then(r => r.json()).then(setRangeBkgs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.roomId, calView, viewDateStr])

  useEffect(() => { fetchRoom(); fetchToday() }, [fetchRoom, fetchToday])
  useEffect(() => { fetchRange() }, [fetchRange])

  // When the modal date changes, navigate the calendar to follow it
  useEffect(() => {
    if (showModal !== 'later' || !mDate) return
    if (calView === 'day') {
      if (mDate !== dateStr(viewDate)) setViewDate(new Date(mDate + 'T12:00:00'))
    } else if (calView === 'week') {
      const mon = isoMonday(viewDate)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      if (mDate < dateStr(mon) || mDate > dateStr(sun)) setViewDate(new Date(mDate + 'T12:00:00'))
    }
  // viewDate intentionally omitted — only react to mDate changes, not the update we just made
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mDate, showModal, calView])

  // Pre-fill name/email from last booking
  useEffect(() => {
    try {
      const saved = localStorage.getItem('spacebook_user')
      if (saved) { const { name, email } = JSON.parse(saved); setMName(name); setMEmail(email) }
    } catch {}
  }, [])

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Auto-refresh every 60 s
  useEffect(() => {
    const id = setInterval(() => { fetchToday(); fetchRange() }, 60_000)
    return () => clearInterval(id)
  }, [fetchToday, fetchRange])

  // Reset to today / day view after 2 min of inactivity
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    function reset() {
      clearTimeout(timer)
      timer = setTimeout(() => {
        setCalView('day')
        setViewDate(new Date())
        setShowModal(null)
        setMDone(false)
      }, 2 * 60 * 1000)
    }
    reset()
    const events = ['pointerdown', 'touchstart', 'keydown'] as const
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)) }
  }, [])

  const { status, until } = getRoomStatus(todayBkgs)
  const isFree    = status === 'free'
  const bandBg    = isFree ? FREE_BG  : '#8B2020'
  const bigColor  = isFree ? FREE_TEXT : '#ffffff'
  const iconBg    = isFree ? '#C6E8CC' : 'rgba(255,255,255,0.2)'
  const iconStroke = isFree ? FREE_BAR : '#ffffff'

  // Navigation labels + shift logic
  function shiftView(dir: -1 | 1) {
    const d = new Date(viewDate)
    if (calView === 'day')   d.setDate(d.getDate() + dir)
    if (calView === 'week')  d.setDate(d.getDate() + dir * 7)
    if (calView === 'month') d.setMonth(d.getMonth() + dir)
    setViewDate(d)
  }

  function navLabel() {
    if (calView === 'day') {
      const isToday = viewDateStr === todayStr
      return isToday ? `Today · ${DAYS_LONG[viewDate.getDay()]} ${viewDate.getDate()} ${MONTHS_SHORT[viewDate.getMonth()]}` : `${DAYS_LONG[viewDate.getDay()]} ${viewDate.getDate()} ${MONTHS_SHORT[viewDate.getMonth()]}`
    }
    if (calView === 'week') {
      const mon = weekDays[0], sun = weekDays[6]
      if (mon.getMonth() === sun.getMonth()) return `${mon.getDate()}–${sun.getDate()} ${MONTHS_SHORT[mon.getMonth()]}`
      return `${mon.getDate()} ${MONTHS_SHORT[mon.getMonth()]} – ${sun.getDate()} ${MONTHS_SHORT[sun.getMonth()]}`
    }
    return `${MONTHS_LONG[viewDate.getMonth()]} ${viewDate.getFullYear()}`
  }

  function openScheduleLater(date: Date, time: string) {
    const ds = dateStr(date)
    const [h, m] = time.split(':').map(Number)
    const endTotal = Math.min(h * 60 + m + 60, 23 * 60)
    const endHHMM = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`
    setMDate(ds)
    setMTime(time)
    setMEndTime(endHHMM)
    setRecurFreq('none')
    setMDone(false)
    setShowModal('later')
  }

  function openEdit(b: Booking) {
    const bs = new Date(b.start_time), be = new Date(b.end_time)
    setEditBooking(b)
    setEditTitle(b.title ?? '')
    setEditName(b.booker_name)
    setEditEmail(b.booker_email)
    setEditDate(b.start_time.slice(0, 10))
    setEditStart(`${String(bs.getHours()).padStart(2, '0')}:${String(bs.getMinutes()).padStart(2, '0')}`)
    setEditEnd(`${String(be.getHours()).padStart(2, '0')}:${String(be.getMinutes()).padStart(2, '0')}`)
  }

  async function handleEditSave() {
    if (!editBooking) return
    setEditSubmitting(true)
    await fetch(`/api/bookings/${editBooking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booker_name: editName,
        booker_email: editEmail,
        start_time: `${editDate}T${editStart}:00`,
        end_time: `${editDate}T${editEnd}:00`,
        _editor_name: mName,
        _editor_email: mEmail,
        _room_name: room?.name ?? '',
      }),
    })
    setEditBooking(null)
    setEditSubmitting(false)
    fetchRange()
    fetchToday()
  }

  async function handleEditCancel() {
    if (!editBooking || !confirm('Cancel this booking?')) return
    await fetch(`/api/cancel/${editBooking.cancel_token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'this' }) })
    setEditBooking(null)
    fetchRange()
    fetchToday()
  }

  const pendingSlot = showModal === 'later' && mDate && mTime && mEndTime
    ? { ds: mDate, startHHMM: mTime, endHHMM: mEndTime }
    : null

  // Day filter for the day view (filter rangeBkgs to viewDate)
  const dayBookings = rangeBkgs.filter(b => b.start_time.slice(0, 10) === viewDateStr)

  function handleStartTime(time: string) {
    setMTime(time)
    if (time && !mEndTime) {
      const [h, m] = time.split(':').map(Number)
      const endTotal = Math.min(h * 60 + m + 60, 23 * 60)
      setMEndTime(`${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`)
    }
  }

  async function handleQuickBook() {
    if (!room || !mName || !mEmail || !mTime || !mEndTime) return
    setMSubmitting(true)
    const startTime = new Date(`${mDate}T${mTime}`).toISOString()
    const endTime   = new Date(`${mDate}T${mEndTime}`).toISOString()
    if (endTime <= startTime) { setMSubmitting(false); return }
    const jsDay = new Date(mDate).getDay()
    const isoDay = jsDay === 0 ? 7 : jsDay
    const recurrence = (showModal === 'later' && recurFreq !== 'none') ? {
      frequency: recurFreq,
      days_of_week: recurFreq === 'weekly' ? [isoDay] : undefined,
      series_end: recurUntil,
    } : undefined
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: room.id, booker_name: mName, booker_email: mEmail, start_time: startTime, end_time: endTime, title: mTitle || null, ...(recurrence ? { recurrence } : {}) }),
    })
    if (res.ok) {
      try { localStorage.setItem('spacebook_user', JSON.stringify({ name: mName, email: mEmail })) } catch {}
      setMTitle(''); setRecurFreq('none'); setMDone(true); fetchToday(); fetchRange()
    }
    setMSubmitting(false)
  }

  const inp: React.CSSProperties = { fontSize: 14, padding: '8px 10px', border: '0.5px solid #C8CDD4', borderRadius: 8, outline: 'none', fontFamily: 'inherit', width: '100%' }
  const lbl: React.CSSProperties = { fontSize: 12, color: '#6B7280', fontWeight: 500, display: 'block', marginBottom: 4 }

  return (
    <div style={{ background: '#F4F4F2', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ borderRadius: 14, overflow: 'hidden', border: '0.5px solid #D0D4D8', maxWidth: 960, width: '100%', background: '#fff', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>

        {/* Clock bar + view tabs */}
        <div style={{ background: '#213452', padding: '8px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: '#fff' }}>
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
            {DAYS_LONG[now.getDay()]}, {now.getDate()} {MONTHS_LONG[now.getMonth()]} {now.getFullYear()}
          </span>
          {/* View tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['day', 'week', 'month'] as CalView[]).map(v => (
              <button key={v} onClick={() => { setCalView(v); setViewDate(new Date()) }}
                style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: calView === v ? 600 : 400, background: calView === v ? ROSE : 'rgba(255,255,255,0.15)', color: '#fff', transition: 'background .15s' }}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {calView === 'day' ? (
          /* ── Day view: 2-column layout ── */
          <div style={{ display: 'flex', alignItems: 'stretch' }}>

            {/* Left: status + buttons */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '0.5px solid #E0E4E8' }}>
              {/* Status */}
              <div style={{ background: bandBg, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16, transition: 'background .4s' }}>
                {isFree ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg viewBox="0 0 28 28" fill="none" width="22" height="22"><circle cx="14" cy="14" r="11" stroke={iconStroke} strokeWidth="2"/><path d="M9 14.5l3.5 3.5 6.5-7" stroke={iconStroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 500, color: bigColor, lineHeight: 1 }}>Available</div>
                      <div style={{ fontSize: 11, marginTop: 4, color: FREE_BAR }}>Free until {until}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '4px 0' }}>
                    <div style={{ fontSize: 38, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>In use</div>
                    <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.82)', marginTop: 8, fontWeight: 400 }}>Free from {until}</div>
                  </div>
                )}
                <div style={{ borderTop: `0.5px solid ${isFree ? '#B8D8BF' : 'rgba(255,255,255,0.25)'}`, paddingTop: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: isFree ? NAVY : '#fff' }}>{room?.name ?? '—'}</div>
                  <div style={{ fontSize: 11, color: isFree ? '#6B7280' : 'rgba(255,255,255,0.85)', marginTop: 3 }}>{room?.capacity} people</div>
                  <div style={{ fontSize: 11, color: isFree ? '#9CA3AF' : 'rgba(255,255,255,0.75)', marginTop: 2 }}>{room?.amenities.join(', ')}</div>
                </div>
              </div>
              {/* Buttons — offset halfway down the remaining space */}
              <div style={{ flex: 1, background: '#FAFAFA', borderTop: '0.5px solid #E8E8E8', display: 'flex', alignItems: 'flex-start', padding: '18% 16px 16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                  {isFree && (
                    <button
                      onClick={() => { const t = toHHMMExact(new Date()); const [h,m] = t.split(':').map(Number); const et = Math.min(h*60+m+60,23*60); setMDate(todayStr); setMTime(t); setMEndTime(`${String(Math.floor(et/60)).padStart(2,'0')}:${String(et%60).padStart(2,'0')}`); setShowModal('now'); setMDone(false) }}
                      style={{ background: ROSE, color: '#fff', border: 'none', borderRadius: 10, padding: '13px 12px', fontSize: 14, fontWeight: 600, cursor: 'pointer', width: '100%' }}>
                      Book now
                    </button>
                  )}
                  <button
                    onClick={() => { setMDate(todayStr); setMTime(''); setMEndTime(''); setRecurFreq('none'); setShowModal('later'); setMDone(false) }}
                    style={{ background: '#fff', border: '0.5px solid #C8CDD4', borderRadius: 10, padding: '13px 12px', fontSize: 13, cursor: 'pointer', color: '#213452', width: '100%' }}>
                    Schedule for later
                  </button>
                </div>
              </div>
            </div>

            {/* Right: nav + calendar */}
            <div style={{ flex: 1, minWidth: 0, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
                <button onClick={() => shiftView(-1)} style={{ background: 'none', border: '0.5px solid #E0E4E8', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: 14, color: '#6B7280', lineHeight: 1 }}>‹</button>
                {(() => {
                  const isCurrent = viewDateStr === todayStr
                  return <span style={{ fontSize: 13, fontWeight: 500, minWidth: 160, textAlign: 'center', color: isCurrent ? ROSE : NAVY, background: isCurrent ? 'rgba(212,155,169,0.12)' : 'transparent', borderRadius: 20, padding: '2px 10px' }}>{navLabel()}</span>
                })()}
                <button onClick={() => shiftView(1)} style={{ background: 'none', border: '0.5px solid #E0E4E8', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: 14, color: '#6B7280', lineHeight: 1 }}>›</button>
              </div>
              <DayView bookings={dayBookings} viewDate={viewDate} onSlotClick={openScheduleLater} onBookingClick={openEdit} pendingSlot={pendingSlot} now={now} />
            </div>
          </div>
        ) : (
          /* ── Week / Month: original full-width layout ── */
          <>
            <div style={{ background: '#fff', padding: '16px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
                <button onClick={() => shiftView(-1)} style={{ background: 'none', border: '0.5px solid #E0E4E8', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: 14, color: '#6B7280', lineHeight: 1 }}>‹</button>
                {(() => {
                  const isCurrent =
                    (calView === 'week'  && todayStr >= dateStr(weekDays[0]) && todayStr <= dateStr(weekDays[6])) ||
                    (calView === 'month' && viewDate.getFullYear() === now.getFullYear() && viewDate.getMonth() === now.getMonth())
                  return <span style={{ fontSize: 13, fontWeight: 500, minWidth: 160, textAlign: 'center', color: isCurrent ? ROSE : NAVY, background: isCurrent ? 'rgba(212,155,169,0.12)' : 'transparent', borderRadius: 20, padding: '2px 10px' }}>{navLabel()}</span>
                })()}
                <button onClick={() => shiftView(1)} style={{ background: 'none', border: '0.5px solid #E0E4E8', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: 14, color: '#6B7280', lineHeight: 1 }}>›</button>
              </div>
              {calView === 'week'  && <WeekView  bookings={rangeBkgs} weekDays={weekDays} onSlotClick={openScheduleLater} onBookingClick={openEdit} pendingSlot={pendingSlot} now={now} />}
              {calView === 'month' && <MonthView bookings={rangeBkgs} viewDate={viewDate} onDayClick={d => { setViewDate(d); setCalView('day') }} />}
            </div>

            <div style={{ background: '#FAFAFA', borderTop: '0.5px solid #E8E8E8', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: '#9CA3AF' }}>{isFree ? 'Room is free — book it now or schedule ahead' : 'This room is currently occupied'}</span>
              <div style={{ display: 'flex', gap: 10 }}>
                {isFree && (
                  <button onClick={() => { const t = toHHMMExact(new Date()); const [h,m] = t.split(':').map(Number); const et = Math.min(h*60+m+60,23*60); setMDate(todayStr); setMTime(t); setMEndTime(`${String(Math.floor(et/60)).padStart(2,'0')}:${String(et%60).padStart(2,'0')}`); setShowModal('now'); setMDone(false) }}
                    style={{ background: ROSE, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    Book now
                  </button>
                )}
                <button onClick={() => { setMDate(todayStr); setMTime(''); setMEndTime(''); setShowModal('later'); setMDone(false) }}
                  style={{ background: '#fff', border: '0.5px solid #C8CDD4', borderRadius: 8, padding: '10px 18px', fontSize: 13, cursor: 'pointer', color: '#213452' }}>
                  Schedule for later
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quick-book modal */}
      {showModal && (
        <div onClick={() => setShowModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(44,62,107,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 28, width: 340, border: '0.5px solid #E0E4E8' }}>
            {mDone ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: NAVY, marginBottom: 8 }}>Booking confirmed!</div>
                <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>Your room is reserved.</div>
                <button onClick={() => { setShowModal(null); setMName(''); setMEmail(''); setMTime(''); setMEndTime('') }}
                  style={{ background: ROSE, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Done</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16, color: NAVY }}>
                  {showModal === 'now' ? 'Book now' : 'Schedule for later'} — {room?.name}
                </div>
                {showModal === 'later' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Date</label>
                    <input style={inp} type="date" value={mDate} onChange={e => setMDate(e.target.value)} />
                  </div>
                )}
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Your name</label>
                  <NameAutocomplete
                    value={mName}
                    onChange={setMName}
                    onSelect={u => { setMName(u.name); setMEmail(u.email) }}
                    style={inp}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Email</label>
                  <input style={inp} type="email" placeholder="you@example.com" value={mEmail} onChange={e => setMEmail(e.target.value)} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Title</label>
                  <div style={{ fontSize: 11, color: '#C0392B', fontWeight: 600, marginBottom: 6 }}>⚠ Everyone can see this</div>
                  <input style={inp} placeholder="e.g. Team standup" value={mTitle} onChange={e => setMTitle(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Start time</label>
                    <TimePicker value={mTime} onChange={handleStartTime} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>End time</label>
                    <TimePicker value={mEndTime} onChange={setMEndTime} />
                  </div>
                </div>
                {mTime && mEndTime && mEndTime <= mTime && (
                  <div style={{ fontSize: 12, color: '#B94040', marginBottom: 12 }}>End time must be after start time.</div>
                )}
                {showModal === 'later' && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={lbl}>Repeat</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['none', 'weekly', 'monthly'] as const).map(f => (
                        <button key={f} onClick={() => setRecurFreq(f)}
                          style={{ flex: 1, padding: '6px 0', fontSize: 12, borderRadius: 20, border: `0.5px solid ${recurFreq === f ? ROSE : '#C8CDD4'}`, cursor: 'pointer', fontFamily: 'inherit', background: recurFreq === f ? ROSE : 'transparent', color: recurFreq === f ? '#fff' : '#374151', fontWeight: recurFreq === f ? 600 : 400, transition: 'all .15s' }}>
                          {f === 'none' ? 'None' : f === 'weekly' ? 'Weekly' : 'Monthly'}
                        </button>
                      ))}
                    </div>
                    {recurFreq !== 'none' && mDate && (() => {
                      const d = new Date(mDate + 'T12:00:00')
                      const dayName = DAYS_LONG[d.getDay()]
                      const desc = recurFreq === 'weekly'
                        ? `Every ${dayName}`
                        : `Every ${ordinal(Math.ceil(d.getDate() / 7))} ${dayName} of the month`
                      return (
                        <>
                          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 8, marginBottom: 10 }}>↻ {desc}</div>
                          <label style={lbl}>Repeat until</label>
                          <input style={inp} type="date" value={recurUntil} min={mDate} onChange={e => setRecurUntil(e.target.value)} />
                        </>
                      )
                    })()}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowModal(null)}
                    style={{ flex: 1, background: 'none', border: '0.5px solid #C8CDD4', borderRadius: 8, padding: 10, fontSize: 14, cursor: 'pointer', color: '#6B7280' }}>
                    Cancel
                  </button>
                  <button onClick={handleQuickBook} disabled={mSubmitting || !mTime || !mEndTime || mEndTime <= mTime || (showModal === 'later' && recurFreq !== 'none' && !recurUntil)}
                    style={{ flex: 1, background: mSubmitting ? '#e8bdc7' : ROSE, color: '#fff', border: 'none', borderRadius: 8, padding: 10, fontSize: 14, fontWeight: 600, cursor: (mSubmitting || mEndTime <= mTime) ? 'default' : 'pointer' }}>
                    {mSubmitting ? 'Booking…' : 'Confirm'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit booking modal */}
      {editBooking && (() => {
        const isOthers = mEmail && editBooking.booker_email !== mEmail
        const editInvalid = !editStart || !editEnd || editEnd <= editStart
        return (
          <div onClick={() => setEditBooking(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(44,62,107,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 28, width: 340, border: '0.5px solid #E0E4E8', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: NAVY, marginBottom: isOthers ? 10 : 16 }}>
                Edit booking — {room?.name}
              </div>
              {isOthers && (
                <div style={{ background: '#C0392B', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>⚠️ Not your booking</div>
                  <div style={{ fontSize: 12, color: '#fddede', lineHeight: 1.5 }}>
                    This belongs to <strong style={{ color: '#fff' }}>{editBooking.booker_name}</strong>. They will receive an email if you save changes.
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Your name</label>
                <NameAutocomplete value={editName} onChange={setEditName} onSelect={u => { setEditName(u.name); setEditEmail(u.email) }} style={inp} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Email</label>
                <input style={inp} type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Date</label>
                <input style={inp} type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: editInvalid ? 8 : 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Start time</label>
                  <TimePicker value={editStart} onChange={setEditStart} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>End time</label>
                  <TimePicker value={editEnd} onChange={setEditEnd} />
                </div>
              </div>
              {editInvalid && <div style={{ fontSize: 12, color: '#B94040', marginBottom: 12 }}>End time must be after start time.</div>}
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button onClick={() => setEditBooking(null)}
                  style={{ flex: 1, background: 'none', border: '0.5px solid #C8CDD4', borderRadius: 8, padding: 10, fontSize: 13, cursor: 'pointer', color: '#6B7280' }}>
                  Close
                </button>
                <button onClick={handleEditSave} disabled={editSubmitting || editInvalid || !editName || !editEmail}
                  style={{ flex: 1, background: editSubmitting ? '#9ab5c8' : SAGE, color: '#fff', border: 'none', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 600, cursor: editSubmitting ? 'default' : 'pointer' }}>
                  {editSubmitting ? 'Saving…' : 'Save changes'}
                </button>
              </div>
              <button onClick={handleEditCancel}
                style={{ width: '100%', background: 'none', border: 'none', padding: '4px 0', fontSize: 12, color: '#B94040', cursor: 'pointer', textDecoration: 'underline' }}>
                Cancel this booking
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
