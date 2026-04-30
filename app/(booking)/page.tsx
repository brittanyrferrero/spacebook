'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Room, Booking } from '@/types'
import { NameAutocomplete } from '@/components/NameAutocomplete'

// ─── Constants ────────────────────────────────────────────────────────────────
const SAGE = '#5C7A6B'
const NAVY = '#2C3E6B'
const ROSE = '#db95ab'
const FREE_BG = '#E8F4EC'; const FREE_TEXT = '#1E5C30'; const FREE_BAR = '#3B7A4A'
const BUSY_BG = '#e8ecf2'; const BUSY_TEXT = '#213452'; const BUSY_BAR = '#213452'
const WEEKEND_BG = '#fcfaff'
const PAST_BG    = 'rgba(120,120,130,0.18)'
const PAST_TEXT  = '#B0B8C4'

const GRID_START = 8, GRID_END = 19, GRID_HOURS = GRID_END - GRID_START, HOUR_H = 38, GRID_H = GRID_HOURS * HOUR_H

const NAV_STARS = [
  { top: '22%', left: '5%',  size: 1.5, o: 0.55 },
  { top: '70%', left: '9%',  size: 1,   o: 0.32 },
  { top: '15%', left: '17%', size: 2,   o: 0.38 },
  { top: '78%', left: '26%', size: 1.5, o: 0.25 },
  { top: '42%', left: '37%', size: 1,   o: 0.42 },
  { top: '20%', left: '61%', size: 1.5, o: 0.35 },
  { top: '75%', left: '69%', size: 2,   o: 0.28 },
  { top: '28%', left: '79%', size: 1,   o: 0.52 },
  { top: '62%', left: '86%', size: 1.5, o: 0.25 },
  { top: '38%', left: '93%', size: 1,   o: 0.45 },
]

const FIREWORK_PARTICLES = Array.from({ length: 30 }, (_, i) => {
  const angle = (i / 30) * 360 + [-6,4,-2,8,-5,3,0,7,-3,5][i % 10]
  const dist  = [55,75,45,90,65,80,50,70,60,85][i % 10]
  return {
    tx:       Math.cos(angle * Math.PI / 180) * dist,
    ty:       Math.sin(angle * Math.PI / 180) * dist,
    color:    ['#FFD700','#FF8C00','#FFA500','#FF4500','#FFF8DC'][i % 5],
    size:     [5,4,6,3,5,4,6][i % 7],
    delay:    (i % 6) * 0.045,
    duration: 0.6 + (i % 4) * 0.1,
  }
})

const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_LONG    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DAYS_SHORT   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7)
const MINS  = [0, 15, 30, 45]

type CalView = 'day' | 'week' | 'month'

// ─── Theme ────────────────────────────────────────────────────────────────────
function mkT(dark: boolean) {
  return {
    pageBg:          dark ? '#090d18'                                          : '#f0eff8',
    cardBg:          dark ? '#111828'                                          : '#fff',
    border:          dark ? '#1c2840'                                          : '#E0E4E8',
    borderFaint:     dark ? 'rgba(255,255,255,0.07)'                           : '#F0F0EE',
    text:            dark ? '#dde5f8'                                          : '#374151',
    textMuted:       dark ? '#7a8aaa'                                          : '#9CA3AF',
    textFaint:       dark ? '#404e6a'                                          : '#B0B0B0',
    navBg:           dark ? 'linear-gradient(135deg,#0e1628 0%,#1c0f38 100%)' : 'linear-gradient(135deg,#1e2d5a 0%,#2e1558 100%)',
    activeRoom:      dark ? 'rgba(59,122,74,0.18)'                             : 'rgba(59,122,74,0.10)',
    activeBorder:    FREE_BAR,
    bandOdd:         dark ? 'rgba(255,255,255,0.022)'                          : 'rgba(0,0,0,0.018)',
    gridLine:        dark ? 'rgba(255,255,255,0.065)'                          : '#ECECEC',
    colSep:          dark ? 'rgba(255,255,255,0.065)'                          : '#F0F0EE',
    weekendBg:       dark ? 'rgba(110,80,165,0.07)'                            : WEEKEND_BG,
    pastBg:          dark ? 'rgba(0,0,0,0.22)'                                 : PAST_BG,
    pastText:        dark ? '#384565'                                          : PAST_TEXT,
    blockBg:         dark ? '#1b3260'                                          : '#c8d2e0',
    blockBorder:     dark ? '#4878c8'                                          : BUSY_BAR,
    pastBlockBg:     dark ? '#111a30'                                          : '#dde1e8',
    pastBlockBorder: dark ? '#243250'                                          : '#aab0be',
    calDayBg:        dark ? '#13192e'                                          : '#fff',
    inputBg:         dark ? '#0d1525'                                          : '#fff',
    inputBorder:     dark ? '#1c2840'                                          : '#C8CDD4',
    modalBg:         dark ? '#111828'                                          : '#fff',
    modalBorder:     dark ? '#1c2840'                                          : '#E0E4E8',
    inpText:         dark ? '#dde5f8'                                          : 'inherit',
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const dateStr = (d: Date) => d.toISOString().slice(0, 10)

function isoMonday(d: Date): Date {
  const copy = new Date(d)
  const dow = copy.getDay()
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

function toGridPct(h: number, m: number) {
  return ((h - GRID_START) + m / 60) / GRID_HOURS
}

function fmtHour(h: number) {
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function ordinal(n: number) { return ['1st','2nd','3rd','4th','5th'][n - 1] ?? `${n}th` }

function toHHMMExact(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function toMins(hhmm: string) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
function fromMins(mins: number) { return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` }
function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

function findNextAvailable(date: string, startHHMM: string, endHHMM: string, bookings: Booking[]): string | null {
  const dur = toMins(endHHMM) - toMins(startHHMM)
  if (dur <= 0) return null
  const slots = bookings
    .filter(b => !b.cancelled_at && b.start_time.slice(0, 10) === date)
    .map(b => ({ start: new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes(), end: new Date(b.end_time).getHours() * 60 + new Date(b.end_time).getMinutes() }))
    .sort((a, b) => a.start - b.start)
  const conflicts = slots.filter(b => b.start < toMins(endHHMM) && b.end > toMins(startHHMM))
  if (conflicts.length === 0) return null
  let candidate = Math.max(...conflicts.map(b => b.end))
  while (candidate + dur <= GRID_END * 60) {
    const blocking = slots.find(b => b.start < candidate + dur && b.end > candidate)
    if (!blocking) return fromMins(candidate)
    candidate = blocking.end
  }
  return null
}

function getRoomStatusSimple(roomId: string, bookings: Booking[]): 'free' | 'busy' {
  const now = new Date()
  return bookings.some(b => b.room_id === roomId && !b.cancelled_at && new Date(b.start_time) <= now && new Date(b.end_time) > now)
    ? 'busy' : 'free'
}

function getRoomStatusFull(bookings: Booking[]): { status: 'free' | 'busy'; until: string } {
  const now = new Date()
  const active = bookings.filter(b => !b.cancelled_at)
  const current = active.find(b => new Date(b.start_time) <= now && new Date(b.end_time) > now)
  if (current) return { status: 'busy', until: fmt12(current.end_time) }
  const next = active.filter(b => new Date(b.start_time) > now).sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time))[0]
  return { status: 'free', until: next ? fmt12(next.start_time) : 'end of day' }
}

// ─── NowLine ──────────────────────────────────────────────────────────────────
function NowLine({ now, gridH }: { now: Date; gridH: number }) {
  const pct = toGridPct(now.getHours(), now.getMinutes())
  if (pct < 0 || pct > 1) return null
  const top = pct * gridH
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, zIndex: 3, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: -5, top: -5, width: 10, height: 10, borderRadius: '50%', background: ROSE }} />
      <div style={{ height: 2, background: ROSE, opacity: 0.85 }} />
    </div>
  )
}

// ─── TimePicker ───────────────────────────────────────────────────────────────
function TimePicker({ value, onChange, dark }: { value: string; onChange: (v: string) => void; dark?: boolean }) {
  const [rawH, rawM] = value ? value.split(':') : ['', '']
  const T = mkT(dark ?? false)
  const sel: React.CSSProperties = { fontSize: 14, padding: '8px 6px', border: `0.5px solid ${T.inputBorder}`, borderRadius: 8, outline: 'none', fontFamily: 'inherit', flex: 1, background: T.inputBg, cursor: 'pointer', color: T.inpText }
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <select style={sel} value={rawH ?? ''} onChange={e => onChange(`${e.target.value}:${rawM || '00'}`)}>
        <option value="" disabled>HH</option>
        {HOURS.map(h => <option key={h} value={String(h).padStart(2, '0')}>{fmtHour(h)}</option>)}
      </select>
      <select style={sel} value={rawM ?? ''} onChange={e => onChange(`${rawH || '09'}:${e.target.value}`)}>
        <option value="" disabled>MM</option>
        {MINS.map(m => <option key={m} value={String(m).padStart(2, '0')}>{String(m).padStart(2, '0')}</option>)}
      </select>
    </div>
  )
}

// ─── DayView ──────────────────────────────────────────────────────────────────
function DayView({ bookings, viewDate, onSlotClick, onBookingClick, pendingSlot, now, dark, myEmail, hourH = HOUR_H }: {
  bookings: Booking[]; viewDate: Date;
  onSlotClick?: (date: Date, time: string) => void;
  onBookingClick?: (b: Booking) => void;
  pendingSlot?: { ds: string; startHHMM: string; endHHMM: string } | null;
  now?: Date; dark?: boolean; myEmail?: string; hourH?: number;
}) {
  const T = mkT(dark ?? false)
  const gridH = hourH * GRID_HOURS
  const ds = dateStr(viewDate)
  const todayStr = now ? dateStr(now) : ''
  const isPast = ds < todayStr
  const [hoverTime, setHoverTime] = useState<string | null>(null)

  function snapY(y: number) {
    const totalMins = Math.round((GRID_START * 60 + (Math.max(0, Math.min(y, gridH)) / gridH) * GRID_HOURS * 60) / 15) * 15
    const h = Math.min(Math.floor(totalMins / 60), GRID_END - 1)
    const m = totalMins % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const activeBookings = bookings.filter(b => !b.cancelled_at)
  const hourLabels = Array.from({ length: GRID_HOURS + 1 }, (_, i) => {
    const h = GRID_START + i
    return h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
  })

  return (
    <div style={{ display: 'flex', overflow: 'visible' }}>
      <div style={{ flexShrink: 0, width: 38, position: 'relative', height: gridH }}>
        {hourLabels.map((label, i) => (
          <div key={label} style={{ position: 'absolute', top: Math.max(0, i * hourH - 7), right: 4, fontSize: 9, color: dark ? '#8b949e' : '#6B7280', textAlign: 'right', whiteSpace: 'nowrap' }}>{label}</div>
        ))}
      </div>
      <div style={{ flex: 1, borderLeft: `0.5px solid ${T.borderFaint}` }}>
        <div
          style={{ position: 'relative', height: gridH, cursor: onSlotClick && !isPast ? 'pointer' : 'default', background: isPast ? T.pastBg : T.calDayBg }}
          onClick={onSlotClick && !isPast ? (e) => { const rect = e.currentTarget.getBoundingClientRect(); onSlotClick(viewDate, snapY(e.clientY - rect.top)) } : undefined}
          onMouseMove={onSlotClick && !isPast ? (e) => { const rect = e.currentTarget.getBoundingClientRect(); setHoverTime(snapY(e.clientY - rect.top)) } : undefined}
          onMouseLeave={() => setHoverTime(null)}>
          {Array.from({ length: GRID_HOURS }, (_, i) => (
            <div key={i} style={{ position: 'absolute', top: i * hourH, left: 0, right: 0, height: hourH, background: i % 2 === 0 ? T.bandOdd : 'transparent', borderTop: `0.5px solid ${isPast ? T.gridLine : (dark ? 'rgba(255,255,255,0.12)' : '#C8C8C8')}` }} />
          ))}
          {hoverTime && (() => {
            const [sh, sm] = hoverTime.split(':').map(Number)
            const topPx = Math.max(0, toGridPct(sh, sm) * gridH)
            return <div style={{ position: 'absolute', top: topPx, left: 0, right: 0, height: hourH / 4, background: dark ? 'rgba(219,149,171,0.13)' : 'rgba(44,62,107,0.08)', borderTop: `1px solid ${dark ? 'rgba(219,149,171,0.3)' : 'rgba(44,62,107,0.18)'}`, pointerEvents: 'none', transition: 'top 0.08s ease-out' }} />
          })()}
          {pendingSlot?.ds === ds && (() => {
            const [sh, sm] = pendingSlot.startHHMM.split(':').map(Number)
            const [eh, em] = pendingSlot.endHHMM.split(':').map(Number)
            const topPx = Math.max(0, toGridPct(sh, sm) * gridH)
            const heightPx = Math.max(8, (toGridPct(eh, em) - toGridPct(sh, sm)) * gridH)
            return <div style={{ position: 'absolute', top: topPx, left: 2, right: 2, height: heightPx, background: 'rgba(148,163,184,0.25)', borderRadius: 4, border: '1.5px dashed #94A3B8', pointerEvents: 'none' }} />
          })()}
          {now && !isPast && dateStr(viewDate) === dateStr(now) && <NowLine now={now} gridH={gridH} />}
          {activeBookings.map(b => {
            const bs = new Date(b.start_time), be = new Date(b.end_time)
            const topPx = Math.max(0, toGridPct(bs.getHours(), bs.getMinutes()) * gridH)
            const heightPx = Math.max(16, (toGridPct(be.getHours(), be.getMinutes()) - toGridPct(bs.getHours(), bs.getMinutes())) * gridH)
            const isMine = !!myEmail && b.booker_email === myEmail
            const bg     = isPast ? T.pastBlockBg : isMine ? (dark ? '#4a2535' : '#f5e0e7') : T.blockBg
            const border = isPast ? T.pastBlockBorder : isMine ? ROSE : T.blockBorder
            const label  = isMine ? (b.title || b.booker_name) : b.booker_name
            const textColor = isPast ? T.textFaint : isMine ? (dark ? '#e8b4c4' : '#8a3d58') : (dark ? '#c8daf0' : BUSY_BAR)
            return (
              <div key={b.id} onClick={e => { e.stopPropagation(); onBookingClick?.(b) }}
                style={{ position: 'absolute', top: topPx, left: 4, right: 4, height: heightPx, background: bg, borderRadius: 4, cursor: onBookingClick ? 'pointer' : 'default', overflow: 'hidden' }}>
                {heightPx > 18 && <div style={{ padding: '2px 5px', fontSize: 10, color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{b.recurring_series_id ? `↻ ${label}` : label}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── WeekView ─────────────────────────────────────────────────────────────────
function WeekView({ bookings, weekDays, onSlotClick, onBookingClick, pendingSlot, now, dark, myEmail, hourH = HOUR_H }: {
  bookings: Booking[]; weekDays: Date[];
  onSlotClick?: (date: Date, time: string) => void;
  onBookingClick?: (b: Booking) => void;
  pendingSlot?: { ds: string; startHHMM: string; endHHMM: string } | null;
  now?: Date; dark?: boolean; myEmail?: string; hourH?: number;
}) {
  const T = mkT(dark ?? false)
  const gridH = hourH * GRID_HOURS
  const todayStr = dateStr(new Date())
  const [hoverSlot, setHoverSlot] = useState<{ ds: string; time: string } | null>(null)
  const byDay: Record<string, Booking[]> = {}
  for (const b of bookings) {
    const d = b.start_time.slice(0, 10)
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(b)
  }

  function snapY(y: number) {
    const totalMins = Math.round((GRID_START * 60 + (Math.max(0, Math.min(y, gridH)) / gridH) * GRID_HOURS * 60) / 15) * 15
    const h = Math.min(Math.floor(totalMins / 60), GRID_END - 1)
    const m = totalMins % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const hourLabels = Array.from({ length: GRID_HOURS + 1 }, (_, i) => {
    const h = GRID_START + i
    return h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
  })

  return (
    <div>
      <div style={{ display: 'flex', marginLeft: 38, borderLeft: `0.5px solid ${T.borderFaint}` }}>
        {weekDays.map((day, colIdx) => {
          const ds = dateStr(day)
          const isToday   = ds === todayStr
          const isPast    = ds < todayStr
          const isWeekend = colIdx >= 5
          return (
            <div key={ds} style={{ flex: 1, textAlign: 'center', padding: '6px 0 8px', borderRight: colIdx < 6 ? `0.5px solid ${T.colSep}` : 'none' }}>
              <div style={{ fontSize: 10, color: isToday ? ROSE : isPast ? T.pastText : isWeekend ? '#b0a0b8' : T.textMuted, fontWeight: isToday ? 600 : 400 }}>{DAYS_SHORT[colIdx]}</div>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: isToday ? ROSE : 'transparent', color: isToday ? '#fff' : isPast ? T.pastText : isWeekend ? '#8B7A9A' : T.text, fontSize: 12, fontWeight: isToday ? 600 : 400, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px auto 0' }}>
                {day.getDate()}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', overflow: 'auto' }}>
        <div style={{ flexShrink: 0, width: 38, position: 'relative', height: gridH }}>
          {hourLabels.map((label, i) => (
            <div key={label} style={{ position: 'absolute', top: Math.max(0, i * hourH - 7), right: 4, fontSize: 9, color: dark ? '#8b949e' : '#6B7280', textAlign: 'right', whiteSpace: 'nowrap' }}>{label}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, 1fr)`, flex: 1, borderLeft: `0.5px solid ${T.borderFaint}` }}>
          {weekDays.map((day, colIdx) => {
            const ds        = dateStr(day)
            const isToday   = ds === todayStr
            const isPast    = ds < todayStr
            const isWeekend = colIdx >= 5
            const dayBookings = (byDay[ds] ?? []).filter(b => !b.cancelled_at)
            const colBg = isPast ? T.pastBg : isWeekend ? T.weekendBg : T.calDayBg
            return (
              <div key={ds} style={{ borderRight: colIdx < 6 ? `0.5px solid ${T.colSep}` : 'none' }}>
                <div
                  style={{ position: 'relative', height: gridH, background: colBg, cursor: onSlotClick && !isPast ? 'pointer' : 'default' }}
                  onClick={onSlotClick && !isPast ? (e) => { const rect = e.currentTarget.getBoundingClientRect(); onSlotClick(day, snapY(e.clientY - rect.top)) } : undefined}
                  onMouseMove={onSlotClick && !isPast ? (e) => { const rect = e.currentTarget.getBoundingClientRect(); setHoverSlot({ ds, time: snapY(e.clientY - rect.top) }) } : undefined}
                  onMouseLeave={() => setHoverSlot(null)}>
                  {Array.from({ length: GRID_HOURS }, (_, i) => (
                    <div key={i} style={{ position: 'absolute', top: i * hourH, left: 0, right: 0, height: hourH, background: i % 2 === 0 ? T.bandOdd : 'transparent', borderTop: `0.5px solid ${isPast ? T.gridLine : (dark ? 'rgba(255,255,255,0.12)' : '#C8C8C8')}` }} />
                  ))}
                  {hoverSlot?.ds === ds && (() => {
                    const [sh, sm] = hoverSlot.time.split(':').map(Number)
                    return <div style={{ position: 'absolute', top: Math.max(0, toGridPct(sh, sm) * gridH), left: 0, right: 0, height: hourH / 4, background: dark ? 'rgba(219,149,171,0.13)' : 'rgba(44,62,107,0.08)', borderTop: `1px solid ${dark ? 'rgba(219,149,171,0.3)' : 'rgba(44,62,107,0.18)'}`, pointerEvents: 'none', transition: 'top 0.08s ease-out' }} />
                  })()}
                  {pendingSlot?.ds === ds && (() => {
                    const [sh, sm] = pendingSlot.startHHMM.split(':').map(Number)
                    const [eh, em] = pendingSlot.endHHMM.split(':').map(Number)
                    const topPx = Math.max(0, toGridPct(sh, sm) * gridH)
                    const heightPx = Math.max(8, (toGridPct(eh, em) - toGridPct(sh, sm)) * gridH)
                    return <div style={{ position: 'absolute', top: topPx, left: 2, right: 2, height: heightPx, background: 'rgba(148,163,184,0.25)', borderRadius: 4, border: '1.5px dashed #94A3B8', pointerEvents: 'none' }} />
                  })()}
                  {now && isToday && <NowLine now={now} gridH={gridH} />}
                  {dayBookings.map(b => {
                    const bs = new Date(b.start_time), be = new Date(b.end_time)
                    const topPx = Math.max(0, toGridPct(bs.getHours(), bs.getMinutes()) * gridH)
                    const heightPx = Math.max(16, (toGridPct(be.getHours(), be.getMinutes()) - toGridPct(bs.getHours(), bs.getMinutes())) * gridH)
                    const isMine = !!myEmail && b.booker_email === myEmail
                    const bg     = isPast ? T.pastBlockBg : isMine ? (dark ? '#4a2535' : '#f5e0e7') : T.blockBg
                    const border = isPast ? T.pastBlockBorder : isMine ? ROSE : T.blockBorder
                    const label  = isMine ? (b.title || b.booker_name) : b.booker_name
                    const textColor = isPast ? T.textFaint : isMine ? (dark ? '#e8b4c4' : '#8a3d58') : (dark ? '#c8daf0' : BUSY_BAR)
                    return (
                      <div key={b.id} onClick={e => { e.stopPropagation(); onBookingClick?.(b) }}
                        style={{ position: 'absolute', top: topPx, left: 2, right: 2, height: heightPx, background: bg, borderRadius: 4, cursor: onBookingClick ? 'pointer' : 'default', overflow: 'hidden' }}>
                        {heightPx > 18 && <div style={{ padding: '2px 4px', fontSize: 9, color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{b.recurring_series_id ? `↻ ${label}` : label}</div>}
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

// ─── MonthView ────────────────────────────────────────────────────────────────
function MonthView({ bookings, viewDate, onDayClick, dark }: { bookings: Booking[]; viewDate: Date; onDayClick: (d: Date) => void; dark?: boolean }) {
  const T = mkT(dark ?? false)
  const todayStr  = dateStr(new Date())
  const viewMonth = viewDate.getMonth()
  const weeks     = getMonthCalendar(viewDate)
  const byDay: Record<string, number> = {}
  for (const b of bookings) {
    if (b.cancelled_at) continue
    const d = b.start_time.slice(0, 10)
    byDay[d] = (byDay[d] ?? 0) + 1
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
        {DAYS_SHORT.map((d, i) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: i >= 5 ? '#b0a0b8' : T.textMuted, fontWeight: 500, paddingBottom: 4 }}>{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderTop: `0.5px solid ${T.colSep}` }}>
          {week.map((day, di) => {
            const ds        = dateStr(day)
            const inMonth   = day.getMonth() === viewMonth
            const isToday   = ds === todayStr
            const isPast    = ds < todayStr
            const isWeekend = di >= 5
            const count     = byDay[ds] ?? 0
            const cellBg    = isWeekend ? T.weekendBg : T.cardBg
            const numColor  = isToday ? '#fff' : isPast ? T.pastText : isWeekend && inMonth ? '#8B7A9A' : inMonth ? T.text : T.borderFaint
            return (
              <div key={ds} onClick={() => onDayClick(day)}
                style={{ padding: '6px 4px 8px', minHeight: 64, cursor: 'pointer', borderRight: di < 6 ? `0.5px solid ${T.colSep}` : 'none', background: isPast ? T.pastBg : cellBg }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday ? ROSE : 'transparent', color: numColor, fontSize: 11, fontWeight: isToday ? 600 : 400 }}>
                    {day.getDate()}
                  </div>
                </div>
                {count > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
                    {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                      <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: isPast ? T.pastText : ROSE }} />
                    ))}
                    {count > 3 && <div style={{ fontSize: 8, color: T.textMuted, lineHeight: '5px' }}>+{count - 3}</div>}
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BookingPage() {
  const [rooms,          setRooms]         = useState<Room[]>([])
  const [sidebarBkgs,   setSidebarBkgs]   = useState<Booking[]>([])
  const [rangeBkgs,     setRangeBkgs]     = useState<Booking[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [now,           setNow]           = useState(new Date())
  const [calView,       setCalView]       = useState<CalView>('week')
  const [viewDate,      setViewDate]      = useState(new Date())
  const [theme,         setTheme]         = useState<'light' | 'dark'>('light')
  const [lotr,          setLotr]          = useState(false)

  const [showModal,   setShowModal]   = useState<'now' | 'later' | null>(null)
  const [mName,       setMName]       = useState('')
  const [mEmail,      setMEmail]      = useState('')
  const [mDate,       setMDate]       = useState(() => new Date().toISOString().slice(0, 10))
  const [mTitle,      setMTitle]      = useState('')
  const [mTime,       setMTime]       = useState('')
  const [mEndTime,    setMEndTime]    = useState('')
  const [mSubmitting, setMSubmitting] = useState(false)
  const [mDone,       setMDone]       = useState(false)
  const [mError,      setMError]      = useState('')
  const [recurFreq,   setRecurFreq]   = useState<'none' | 'weekly' | 'monthly'>('none')
  const [recurUntil,  setRecurUntil]  = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 3); return d.toISOString().slice(0, 10) })

  // Edit existing booking
  const [editBooking,     setEditBooking]     = useState<Booking | null>(null)
  const [editTitle,       setEditTitle]       = useState('')
  const [editName,        setEditName]        = useState('')
  const [editEmail,       setEditEmail]       = useState('')
  const [editDate,        setEditDate]        = useState('')
  const [editStart,       setEditStart]       = useState('')
  const [editEnd,         setEditEnd]         = useState('')
  const [editSubmitting,  setEditSubmitting]  = useState(false)

  const dark = theme === 'dark'
  const T = mkT(dark)

  const todayStr     = now.toISOString().slice(0, 10)
  const viewDateStr  = dateStr(viewDate)
  const weekDays     = getWeekDays(viewDate)
  const selectedRoom = rooms.find(r => r.id === selectedRoomId) ?? null

  // LOTR text overrides
  const txt = {
    bookNow:    lotr ? 'Claim it! 💍'           : 'Book now',
    schedule:   lotr ? 'Plot your course 🗺️'    : 'Schedule a meeting',
    confirm:    lotr ? 'For the Shire! ⚔️'      : 'Confirm booking',
    confirming: lotr ? 'One moment...'           : 'Confirming…',
    confirmed:  lotr ? 'It is done.' : 'Booking confirmed!',
    subtext:    lotr ? 'All we have to decide is what to do with the time that is given us.' : 'Your room is reserved.',
    done:       lotr ? 'Fly, you fools!'         : 'Done',
    available:  lotr ? '⚔️ Available'            : 'Available',
    inUse:      lotr ? '🔥 Occupied'             : 'In Use',
  }

  function getRange(): { from: string; to: string } {
    if (calView === 'day')  return { from: viewDateStr, to: viewDateStr }
    if (calView === 'week') return { from: dateStr(weekDays[0]), to: dateStr(weekDays[6]) }
    const y = viewDate.getFullYear(), m = viewDate.getMonth()
    return { from: dateStr(new Date(y, m, 1)), to: dateStr(new Date(y, m + 1, 0)) }
  }

  const fetchRooms = useCallback(() => {
    fetch('/api/rooms').then(r => r.json()).then((data: Room[]) => {
      setRooms(data)
      setSelectedRoomId(prev => prev || data[0]?.id || '')
    })
  }, [])

  const fetchSidebar = useCallback(() => {
    fetch(`/api/bookings?date=${todayStr}`).then(r => r.json()).then(setSidebarBkgs)
  }, [todayStr])

  const fetchRange = useCallback(() => {
    if (!selectedRoomId) return
    const { from, to } = getRange()
    fetch(`/api/bookings?room_id=${selectedRoomId}&from=${from}&to=${to}`)
      .then(r => r.json()).then(setRangeBkgs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId, calView, viewDateStr])

  useEffect(() => { fetchRooms() }, [fetchRooms])
  useEffect(() => { fetchSidebar() }, [fetchSidebar])
  useEffect(() => { fetchRange() }, [fetchRange])

  useEffect(() => {
    if (showModal !== 'later' || !mDate) return
    if (calView === 'day') {
      if (mDate !== dateStr(viewDate)) setViewDate(new Date(mDate + 'T12:00:00'))
    } else if (calView === 'week') {
      const mon = isoMonday(viewDate)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      if (mDate < dateStr(mon) || mDate > dateStr(sun)) setViewDate(new Date(mDate + 'T12:00:00'))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mDate, showModal, calView])

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('demo') === '1') {
        setMName('Alex Kim'); setMEmail('alex@example.com'); return
      }
      const saved = localStorage.getItem('spacebook_user')
      if (saved) { const { name, email } = JSON.parse(saved); setMName(name); setMEmail(email) }
    } catch {}
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => { fetchSidebar(); fetchRange() }, 60_000)
    return () => clearInterval(id)
  }, [fetchSidebar, fetchRange])

  // Measure calendar container to compute dynamic hourH
  const calRef = useRef<HTMLDivElement>(null)
  const [calContainerH, setCalContainerH] = useState(0)
  useEffect(() => {
    const el = calRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCalContainerH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const WEEK_HEADER_H = 52 // day-name + number circle rows
  const CAL_PAD = 32       // 16px top + 16px bottom padding on the container
  const dynHourH = calContainerH > 100
    ? Math.max(28, Math.floor((calContainerH - CAL_PAD - (calView === 'week' ? WEEK_HEADER_H : 0)) / GRID_HOURS))
    : HOUR_H

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
      return isToday
        ? `Today · ${DAYS_LONG[viewDate.getDay()]} ${viewDate.getDate()} ${MONTHS_SHORT[viewDate.getMonth()]}`
        : `${DAYS_LONG[viewDate.getDay()]} ${viewDate.getDate()} ${MONTHS_SHORT[viewDate.getMonth()]}`
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
    setMDate(ds); setMTime(time); setMEndTime(endHHMM); setRecurFreq('none'); setMError(''); setMDone(false); setShowModal('later')
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
        ...(mEmail && editBooking.booker_email === mEmail ? { title: editTitle || null } : {}),
        booker_name: editName,
        booker_email: editEmail,
        start_time: `${editDate}T${editStart}:00`,
        end_time: `${editDate}T${editEnd}:00`,
        _editor_name: mName,
        _editor_email: mEmail,
        _room_name: selectedRoom?.name ?? '',
      }),
    })
    setEditBooking(null)
    setEditSubmitting(false)
    fetchRange()
    fetchSidebar()
  }

  async function handleEditCancel() {
    if (!editBooking || !confirm('Cancel this booking?')) return
    await fetch(`/api/cancel/${editBooking.cancel_token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'this' }) })
    setEditBooking(null)
    fetchRange()
    fetchSidebar()
  }

  function handleStartTime(time: string) {
    setMTime(time)
    if (time && !mEndTime) {
      const [h, m] = time.split(':').map(Number)
      const endTotal = Math.min(h * 60 + m + 60, 23 * 60)
      setMEndTime(`${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`)
    }
  }

  const pendingSlot = showModal === 'later' && mDate && mTime && mEndTime
    ? { ds: mDate, startHHMM: mTime, endHHMM: mEndTime }
    : null

  const dayBookings = rangeBkgs.filter(b => b.start_time.slice(0, 10) === viewDateStr)

  const selectedRoomTodayBkgs = sidebarBkgs.filter(b => b.room_id === selectedRoomId)
  const isFree = getRoomStatusFull(selectedRoomTodayBkgs).status === 'free'

  async function handleQuickBook() {
    if (!selectedRoom || !mName || !mEmail || !mTime || !mEndTime) return
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
      body: JSON.stringify({ room_id: selectedRoom.id, booker_name: mName, booker_email: mEmail, start_time: startTime, end_time: endTime, title: mTitle || null, ...(recurrence ? { recurrence } : {}) }),
    })
    if (res.ok) {
      try { localStorage.setItem('spacebook_user', JSON.stringify({ name: mName, email: mEmail })) } catch {}
      setMTitle(''); setRecurFreq('none'); setMError(''); setMDone(true); fetchSidebar(); fetchRange()
    } else {
      const body = await res.json().catch(() => ({}))
      let errorMsg = body.error ?? 'Something went wrong. Please try again.'
      if (res.status === 409) {
        const next = findNextAvailable(mDate, mTime, mEndTime, rangeBkgs)
        const dur = toMins(mEndTime) - toMins(mTime)
        errorMsg = next
          ? `There's a conflict! Next available: ${fmtTime(next)}–${fmtTime(fromMins(toMins(next) + dur))}.`
          : `There's a conflict! No availability left today for that duration.`
      }
      setMError(errorMsg)
    }
    setMSubmitting(false)
  }

  const inp: React.CSSProperties = { fontSize: 14, padding: '9px 12px', border: `1px solid ${T.inputBorder}`, borderRadius: 10, outline: 'none', fontFamily: 'inherit', width: '100%', background: T.inputBg, color: T.inpText, colorScheme: dark ? 'dark' : 'light' }
  const lbl: React.CSSProperties = { fontSize: 10, color: T.textMuted, fontWeight: 600, display: 'block', marginBottom: 5, letterSpacing: '0.08em', textTransform: 'uppercase' as const }
  const timeInvalid = !!(mTime && mEndTime && mEndTime <= mTime)
  const roseGrad = ROSE

  const toggleBtn: React.CSSProperties = { background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }

  return (
    <div style={{ background: T.pageBg, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`@keyframes tabShine{0%,100%{border-bottom-color:rgba(219,149,171,0.6)}50%{border-bottom-color:rgba(219,149,171,1)}}`}</style>

      {/* Top bar */}
      <div style={{ background: T.navBg, padding: '14px 24px', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>

        {/* Star field */}
        {NAV_STARS.map((s, i) => (
          <div key={i} style={{ position: 'absolute', top: s.top, left: s.left, width: s.size, height: s.size, borderRadius: '50%', background: '#fff', opacity: s.o, pointerEvents: 'none' }} />
        ))}

        {/* Orbit arc — subtle ellipse with a planet dot */}
        <svg style={{ position: 'absolute', left: '38%', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.13 }} width="120" height="44" viewBox="0 0 120 44" fill="none">
          <ellipse cx="100" cy="22" rx="96" ry="17" stroke="white" strokeWidth="0.7" strokeDasharray="3 4"/>
          <circle cx="18" cy="33" r="2.8" fill="white"/>
        </svg>

        {/* Logo */}
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0, letterSpacing: '-0.02em', zIndex: 1 }}>
          space<span style={{ color: ROSE, fontWeight: 300 }}>book</span>
          {lotr && <span style={{ fontSize: 13, marginLeft: 5 }}>🧙</span>}
        </div>

        {/* View tabs — centered over the calendar column (offset by half sidebar width) */}
        <div style={{ position: 'absolute', left: 'calc(50% + 100px)', transform: 'translateX(-50%)', display: 'flex', gap: 22, zIndex: 1 }}>
          {(['day', 'week', 'month'] as CalView[]).map(v => (
            <button key={v} onClick={() => { setCalView(v); setViewDate(new Date()) }}
              style={{ fontSize: 12, padding: '0 0 5px', border: 'none', borderBottom: calView === v ? '1.5px solid rgba(219,149,171,0.35)' : '1.5px solid transparent', animation: calView === v ? 'tabShine 6s ease-in-out infinite' : undefined, cursor: 'pointer', fontFamily: 'inherit', fontWeight: calView === v ? 600 : 400, background: 'transparent', color: calView === v ? '#fff' : 'rgba(255,255,255,0.42)', transition: 'color .15s', letterSpacing: '0.1em', textTransform: 'uppercase' as const, lineHeight: 1 }}>
              {v}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', zIndex: 1 }}>
          {/* Theme slider */}
          <div onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            title={dark ? 'Light mode' : 'Dark mode'}
            style={{ width: 34, height: 18, borderRadius: 9, background: 'rgba(255,255,255,0.15)', border: '0.5px solid rgba(255,255,255,0.22)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, left: dark ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }} />
          </div>
          {/* LOTR wizard */}
          <span onClick={() => setLotr(l => !l)} title="One ring to rule them all"
            style={{ cursor: 'pointer', fontSize: 15, opacity: lotr ? 1 : 0.3, transition: 'opacity .18s', userSelect: 'none' as const, lineHeight: 1 }}>
            🧙
          </span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '200px 1fr', gridTemplateRows: 'auto 1fr auto' }}>

        {/* [0,0] Sidebar header spacer */}
        <div style={{ background: T.cardBg }} />

        {/* [0,1] Nav row */}
        <div style={{ background: T.cardBg, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => shiftView(-1)} style={{ background: 'none', border: `0.5px solid ${T.border}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 14, color: T.textMuted }}>‹</button>
            {(() => {
              const isCurrent =
                (calView === 'week'  && todayStr >= dateStr(weekDays[0]) && todayStr <= dateStr(weekDays[6])) ||
                (calView === 'day'   && viewDateStr === todayStr) ||
                (calView === 'month' && viewDate.getFullYear() === now.getFullYear() && viewDate.getMonth() === now.getMonth())
              return (
                <span style={{ fontSize: 13, fontWeight: 500, minWidth: 180, textAlign: 'center', color: isCurrent ? ROSE : dark ? T.text : NAVY, background: isCurrent ? 'rgba(219,149,171,0.12)' : 'transparent', borderRadius: 20, padding: '2px 10px' }}>
                  {navLabel()}
                </span>
              )
            })()}
            <button onClick={() => shiftView(1)} style={{ background: 'none', border: `0.5px solid ${T.border}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 14, color: T.textMuted }}>›</button>
          </div>
        </div>

        {/* [1,0] Sidebar rooms list */}
        <div style={{ background: T.cardBg, overflowY: 'auto', padding: '8px 14px' }}>
          {rooms.map(room => {
            const { status, until } = getRoomStatusFull(sidebarBkgs.filter(b => b.room_id === room.id))
            const isBusy = status === 'busy'
            const dot = isBusy ? '#DC2626' : FREE_BAR
            const active = room.id === selectedRoomId
            return (
              <div key={room.id} onClick={() => setSelectedRoomId(room.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 1, background: active ? T.activeRoom : 'transparent', border: active ? `1px solid ${T.activeBorder}` : '1px solid transparent', transition: 'background 0.12s ease-out, border-color 0.12s ease-out' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: T.text, fontWeight: active ? 600 : 400, letterSpacing: active ? '-0.01em' : 0 }}>{room.name}</div>
                  <div style={{ fontSize: 10, color: T.textFaint }}>{room.capacity} people</div>
                  <div style={{ fontSize: 10, color: isBusy ? '#DC2626' : T.textMuted, letterSpacing: '0.03em' }}>{isBusy ? `In use · free at ${until}` : `Free until ${until}`}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* [1,1] Calendar */}
        <div ref={calRef} style={{ padding: '16px 20px', overflow: 'auto' }}>
          {calView === 'day'   && <DayView   bookings={dayBookings} viewDate={viewDate} onSlotClick={openScheduleLater} onBookingClick={openEdit} pendingSlot={pendingSlot} now={now} dark={dark} myEmail={mEmail} hourH={dynHourH} />}
          {calView === 'week'  && <WeekView  bookings={rangeBkgs}   weekDays={weekDays} onSlotClick={openScheduleLater} onBookingClick={openEdit} pendingSlot={pendingSlot} now={now} dark={dark} myEmail={mEmail} hourH={dynHourH} />}
          {calView === 'month' && <MonthView bookings={rangeBkgs}   viewDate={viewDate} onDayClick={d => { setViewDate(d); setCalView('day') }} dark={dark} />}
        </div>

        {/* [2,0] Sidebar footer */}
        <div style={{ background: T.cardBg }} />

        {/* [2,1] Bottom bar */}
        <div style={{ background: T.cardBg, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            {isFree && (
              <button onClick={() => {
                const t = toHHMMExact(new Date())
                const [h, m] = t.split(':').map(Number)
                const et = Math.min(h * 60 + m + 60, 23 * 60)
                setMDate(todayStr); setMTime(t)
                setMEndTime(`${String(Math.floor(et / 60)).padStart(2, '0')}:${String(et % 60).padStart(2, '0')}`)
                setMError(''); setShowModal('now'); setMDone(false)
              }}
                style={{ background: roseGrad, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
                {txt.bookNow}
              </button>
            )}
            <button onClick={() => { setMDate(todayStr); setMTime(''); setMEndTime(''); setRecurFreq('none'); setMError(''); setShowModal('later'); setMDone(false) }}
              style={{ background: 'transparent', border: `1px solid ${T.inputBorder}`, borderRadius: 12, padding: '12px 22px', fontSize: 14, cursor: 'pointer', color: T.text, whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>
              {txt.schedule}
            </button>
          </div>
        </div>

      </div>

      {/* Modal */}
      {showModal && (
        <div onClick={() => setShowModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.modalBg, borderRadius: 18, padding: 28, width: 370, border: `1px solid ${T.modalBorder}`, boxShadow: dark ? '0 24px 64px rgba(0,0,0,0.6)' : '0 12px 48px rgba(0,0,0,0.18)' }}>
            {mDone ? (
              <div style={{ textAlign: 'center', position: 'relative' }}>
                {lotr && (
                  <>
                    <style>{`@keyframes spark{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--stx),var(--sty)) scale(0.1);opacity:0}}`}</style>
                    <div style={{ position: 'absolute', top: '20%', left: '50%', pointerEvents: 'none' }}>
                      {FIREWORK_PARTICLES.map((p, i) => (
                        <div key={i} style={{ position: 'absolute', width: p.size, height: p.size, borderRadius: '50%', background: p.color, animationName: 'spark', animationDuration: `${p.duration}s`, animationTimingFunction: 'ease-out', animationDelay: `${p.delay}s`, animationFillMode: 'forwards', '--stx': `${p.tx}px`, '--sty': `${p.ty}px` } as React.CSSProperties} />
                      ))}
                    </div>
                  </>
                )}
                <div style={{ fontSize: 16, fontWeight: 500, color: dark ? T.text : NAVY, marginBottom: 8 }}>{txt.confirmed}</div>
                <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 16 }}>{txt.subtext}</div>
                <button onClick={() => setShowModal(null)}
                  style={{ background: ROSE, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>{txt.done}</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20, color: dark ? T.text : NAVY, letterSpacing: '-0.02em' }}>
                  {showModal === 'now' ? txt.bookNow : 'Schedule'} <span style={{ color: ROSE }}>·</span> {selectedRoom?.name}
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
                <div style={{ display: 'flex', gap: 8, marginBottom: timeInvalid ? 8 : 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Start time</label>
                    <TimePicker value={mTime} onChange={handleStartTime} dark={dark} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>End time</label>
                    <TimePicker value={mEndTime} onChange={setMEndTime} dark={dark} />
                  </div>
                </div>
                {timeInvalid && (
                  <div style={{ fontSize: 12, color: '#B94040', marginBottom: 12 }}>End time must be after start time.</div>
                )}
                {showModal === 'later' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Repeat</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['none', 'weekly', 'monthly'] as const).map(f => (
                        <button key={f} onClick={() => setRecurFreq(f)}
                          style={{ flex: 1, padding: '6px 0', fontSize: 12, borderRadius: 20, border: `0.5px solid ${recurFreq === f ? ROSE : T.inputBorder}`, cursor: 'pointer', fontFamily: 'inherit', background: recurFreq === f ? ROSE : 'transparent', color: recurFreq === f ? '#fff' : T.text, fontWeight: recurFreq === f ? 600 : 400, transition: 'all .15s' }}>
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
                          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8, marginBottom: 10 }}>↻ {desc}</div>
                          <label style={lbl}>Repeat until</label>
                          <input style={inp} type="date" value={recurUntil} min={mDate} onChange={e => setRecurUntil(e.target.value)} />
                        </>
                      )
                    })()}
                  </div>
                )}
                {mError && (
                  <div style={{ fontSize: 12, color: '#B94040', background: '#fdf2f2', border: '0.5px solid #f5c6c6', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>{mError}</div>
                )}
                <button onClick={handleQuickBook} disabled={mSubmitting || !mName || !mEmail || !mTime || !mEndTime || timeInvalid || (showModal === 'later' && recurFreq !== 'none' && !recurUntil)}
                  style={{ width: '100%', background: mSubmitting ? '#e8bdc7' : roseGrad, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: (mSubmitting || timeInvalid) ? 'default' : 'pointer', letterSpacing: '0.02em', marginTop: 4 }}>
                  {mSubmitting ? txt.confirming : txt.confirm}
                </button>
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
          <div onClick={() => setEditBooking(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: T.modalBg, borderRadius: 18, padding: 28, width: 370, border: `1px solid ${T.modalBorder}`, boxShadow: dark ? '0 24px 64px rgba(0,0,0,0.6)' : '0 12px 48px rgba(0,0,0,0.18)' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: dark ? T.text : NAVY, marginBottom: isOthers ? 10 : 20, letterSpacing: '-0.02em' }}>
                Edit booking <span style={{ color: ROSE }}>·</span> {selectedRoom?.name}
              </div>
              {isOthers && (
                <div style={{ background: '#C0392B', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>⚠️ Not your booking</div>
                  <div style={{ fontSize: 12, color: '#fddede', lineHeight: 1.5 }}>
                    This belongs to <strong style={{ color: '#fff' }}>{editBooking.booker_name}</strong>. They will receive an email if you save changes.
                  </div>
                </div>
              )}
              {!isOthers && (
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Title</label>
                  <div style={{ fontSize: 11, color: '#C0392B', fontWeight: 600, marginBottom: 6 }}>⚠ Everyone can see this</div>
                  <input style={inp} placeholder="e.g. Team standup" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>{isOthers ? 'Booked by' : 'Your name'}</label>
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
                  <TimePicker value={editStart} onChange={setEditStart} dark={dark} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>End time</label>
                  <TimePicker value={editEnd} onChange={setEditEnd} dark={dark} />
                </div>
              </div>
              {editInvalid && <div style={{ fontSize: 12, color: '#B94040', marginBottom: 12 }}>End time must be after start time.</div>}
              <button onClick={handleEditSave} disabled={editSubmitting || editInvalid || !editName || !editEmail}
                style={{ width: '100%', background: editSubmitting ? '#9ab5c8' : SAGE, color: '#fff', border: 'none', borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 600, cursor: editSubmitting ? 'default' : 'pointer', marginBottom: 8, letterSpacing: '0.02em' }}>
                {editSubmitting ? 'Saving…' : 'Save changes'}
              </button>
              <button onClick={handleEditCancel}
                style={{ width: '100%', background: 'none', border: 'none', padding: '6px 0', fontSize: 12, color: '#B94040', cursor: 'pointer', textDecoration: 'underline' }}>
                Cancel this booking
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
