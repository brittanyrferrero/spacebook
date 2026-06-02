'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import type { Room, Booking } from '@/types'
import { NameAutocomplete } from '@/components/NameAutocomplete'

// ─── Constants ────────────────────────────────────────────────────────────────
const SAGE = '#5C7A6B'
const NAVY = '#111111'
const ROSE = '#db95ab'
const BOOK_GREEN = '#1db954'
const FREE_BG = '#e0f0e8'; const FREE_TEXT = '#2d7a42'; const FREE_BAR = '#4d8f5c'
const BUSY_BG = '#f0f0f0'; const BUSY_TEXT = '#333333'; const BUSY_BAR = '#555555'
const WEEKEND_BG = 'rgba(0,0,0,0.014)'
const PAST_BG    = 'rgba(0,0,0,0.30)'
const PAST_TEXT  = '#aaaaaa'

const GRID_START = 8, GRID_END = 20, GRID_HOURS = GRID_END - GRID_START, HOUR_H = 38, GRID_H = GRID_HOURS * HOUR_H

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
    pageBg:          dark ? '#111111'                   : '#ffffff',
    cardBg:          dark ? '#1a1a1a'                   : '#ffffff',
    border:          dark ? '#2e2e2e'                   : '#cccccc',
    borderFaint:     dark ? 'rgba(255,255,255,0.06)'    : '#e8e8e8',
    text:            dark ? '#e4e4e4'                   : '#111111',
    textMuted:       dark ? '#888888'                   : '#666666',
    textFaint:       dark ? '#464646'                   : '#aaaaaa',
    navBg:           dark ? '#0e0e0e'                   : '#f0ece4',
    navText:         dark ? '#ffffff'                   : '#1c1510',
    navSub:          dark ? 'rgba(255,255,255,0.42)'    : 'rgba(28,21,16,0.42)',
    navBorder:       dark ? '1px solid #222222'         : '1px solid #d8d4cc',
    activeRoom:      dark ? 'rgba(59,122,74,0.18)'      : 'rgba(59,122,74,0.10)',
    activeBorder:    FREE_BAR,
    bandOdd:         dark ? 'rgba(255,255,255,0.055)'   : 'rgba(0,0,0,0.015)',
    gridLine:        dark ? 'rgba(255,255,255,0.06)'    : '#e4e4e4',
    colSep:          dark ? 'rgba(255,255,255,0.06)'    : '#eeeeee',
    weekendBg:       dark ? 'rgba(0,0,0,0.09)'           : WEEKEND_BG,
    pastBg:          dark ? 'rgba(0,0,0,0.50)'          : PAST_BG,
    pastText:        dark ? '#424242'                   : PAST_TEXT,
    blockBg:         dark ? '#303a4a'                   : '#dce0e6',
    blockBorder:     dark ? '#4c607a'                   : '#5a6e84',
    pastBlockBg:     dark ? '#1e1e26'                   : '#e8e8e8',
    pastBlockBorder: dark ? '#2e2e3e'                   : '#cccccc',
    calDayBg:        dark ? '#161616'                   : '#ffffff',
    inputBg:         dark ? '#141414'                   : '#ffffff',
    inputBorder:     dark ? '#2e2e2e'                   : '#cccccc',
    modalBg:         dark ? '#1a1a1a'                   : '#ffffff',
    modalBorder:     dark ? '#2e2e2e'                   : '#cccccc',
    inpText:         dark ? '#e4e4e4'                   : 'inherit',
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const dateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

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

function toGridPct(h: number, m: number, gs = GRID_START, gh = GRID_HOURS) {
  return ((h - gs) + m / 60) / gh
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

function findNextAvailable(date: string, startHHMM: string, endHHMM: string, bookings: Booking[], gridEnd = GRID_END): string | null {
  const dur = toMins(endHHMM) - toMins(startHHMM)
  if (dur <= 0) return null
  const slots = bookings
    .filter(b => !b.cancelled_at && dateStr(new Date(b.start_time)) === date)
    .map(b => ({ start: new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes(), end: new Date(b.end_time).getHours() * 60 + new Date(b.end_time).getMinutes() }))
    .sort((a, b) => a.start - b.start)
  const conflicts = slots.filter(b => b.start < toMins(endHHMM) && b.end > toMins(startHHMM))
  if (conflicts.length === 0) return null
  let candidate = Math.max(...conflicts.map(b => b.end))
  while (candidate + dur <= gridEnd * 60) {
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
function NowLine({ now, gridH, gridStart = GRID_START, gridHours = GRID_HOURS }: { now: Date; gridH: number; gridStart?: number; gridHours?: number }) {
  const pct = toGridPct(now.getHours(), now.getMinutes(), gridStart, gridHours)
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
  const sel: React.CSSProperties = { fontSize: 14, padding: '8px 6px', border: `0.5px solid ${T.inputBorder}`, borderRadius: 0, outline: 'none', fontFamily: 'inherit', flex: 1, background: T.inputBg, cursor: 'pointer', color: T.inpText }
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
function DayView({ bookings, viewDate, onSlotClick, onBookingClick, pendingSlot, now, dark, myEmail, hourH = HOUR_H, gridStart = GRID_START, gridEnd = GRID_END, visShowTitle = false, visShowOrganizer = false }: {
  bookings: Booking[]; viewDate: Date;
  onSlotClick?: (date: Date, time: string) => void;
  onBookingClick?: (b: Booking) => void;
  pendingSlot?: { ds: string; startHHMM: string; endHHMM: string } | null;
  now?: Date; dark?: boolean; myEmail?: string; hourH?: number; gridStart?: number; gridEnd?: number; visShowTitle?: boolean; visShowOrganizer?: boolean;
}) {
  const T = mkT(dark ?? false)
  const gridHours = gridEnd - gridStart
  const gridH = hourH * gridHours
  const gp = (h: number, m: number) => toGridPct(h, m, gridStart, gridHours)
  const ds = dateStr(viewDate)
  const todayStr = now ? dateStr(now) : ''
  const isPast = ds < todayStr
  const [hoverTime, setHoverTime] = useState<string | null>(null)
  const [chronoFlash, setChronoFlash] = useState(false)
  const isToday = ds === todayStr

  function flashChrono() {
    setChronoFlash(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setChronoFlash(true)))
    setTimeout(() => setChronoFlash(false), 1800)
  }

  function isPastSlot(hhmm: string): boolean {
    if (!isToday || !now) return false
    const [h, m] = hhmm.split(':').map(Number)
    const t = new Date(viewDate); t.setHours(h, m, 0, 0)
    return t < now
  }

  function snapY(y: number) {
    const totalMins = Math.round((gridStart * 60 + (Math.max(0, Math.min(y, gridH)) / gridH) * gridHours * 60) / 15) * 15
    const h = Math.min(Math.floor(totalMins / 60), gridEnd - 1)
    const m = totalMins % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const activeBookings = bookings.filter(b => !b.cancelled_at)
  const hourLabels = Array.from({ length: gridHours + 1 }, (_, i) => {
    const h = gridStart + i
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
          style={{ position: 'relative', height: gridH, overflow: 'hidden', cursor: onSlotClick && !isPast ? 'pointer' : 'default', background: isPast ? T.pastBg : T.calDayBg }}
          onClick={onSlotClick && !isPast ? (e) => { const rect = e.currentTarget.getBoundingClientRect(); const t = snapY(e.clientY - rect.top); if (isPastSlot(t)) { flashChrono(); return } onSlotClick(viewDate, t) } : undefined}
          onMouseMove={onSlotClick && !isPast ? (e) => { const rect = e.currentTarget.getBoundingClientRect(); const t = snapY(e.clientY - rect.top); if (isPastSlot(t)) setHoverTime(null); else setHoverTime(t) } : undefined}
          onMouseLeave={() => setHoverTime(null)}>
          {Array.from({ length: gridHours }, (_, i) => (
            <div key={i} style={{ position: 'absolute', top: i * hourH, left: 0, right: 0, height: hourH, background: i % 2 === 0 ? T.bandOdd : 'transparent', borderTop: `0.5px solid ${isPast ? (dark ? 'rgba(255,255,255,0.04)' : '#a8a8a8') : (dark ? 'rgba(255,255,255,0.12)' : '#C8C8C8')}` }} />
          ))}
          {hoverTime && (() => {
            const [sh, sm] = hoverTime.split(':').map(Number)
            const topPx = Math.max(0, gp(sh, sm) * gridH)
            return <div style={{ position: 'absolute', top: topPx, left: 0, right: 0, height: hourH / 4, background: dark ? 'rgba(219,149,171,0.13)' : 'rgba(44,62,107,0.08)', borderTop: `1px solid ${dark ? 'rgba(219,149,171,0.3)' : 'rgba(44,62,107,0.18)'}`, pointerEvents: 'none', transition: 'top 0.08s ease-out' }} />
          })()}
          {pendingSlot?.ds === ds && (() => {
            const [sh, sm] = pendingSlot.startHHMM.split(':').map(Number)
            const [eh, em] = pendingSlot.endHHMM.split(':').map(Number)
            const topPx = Math.max(0, gp(sh, sm) * gridH)
            const heightPx = Math.max(8, (gp(eh, em) - gp(sh, sm)) * gridH)
            return <div style={{ position: 'absolute', top: topPx, left: 2, right: 2, height: heightPx, background: 'rgba(148,163,184,0.25)', borderRadius: 4, border: '1.5px dashed #94A3B8', pointerEvents: 'none' }} />
          })()}
          {now && isToday && (() => {
            const pastH = Math.max(0, gp(now.getHours(), now.getMinutes()) * gridH)
            return pastH > 0 ? <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: pastH, background: dark ? 'rgba(0,0,0,0.50)' : 'rgba(0,0,0,0.30)', pointerEvents: 'none', zIndex: 2 }} /> : null
          })()}
          {chronoFlash && (
            <div style={{ position: 'absolute', top: '38%', left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: dark ? '#888888' : '#6B7280', letterSpacing: '0.07em', animation: 'chronoFlash 1.8s ease-out forwards', whiteSpace: 'nowrap' }}>Chronology protection enforced.</span>
            </div>
          )}
          {now && !isPast && dateStr(viewDate) === dateStr(now) && <NowLine now={now} gridH={gridH} gridStart={gridStart} gridHours={gridHours} />}
          {activeBookings.map(b => {
            const bs = new Date(b.start_time), be = new Date(b.end_time)
            const topPx = Math.max(0, gp(bs.getHours(), bs.getMinutes()) * gridH)
            const heightPx = Math.max(16, (gp(be.getHours(), be.getMinutes()) - gp(bs.getHours(), bs.getMinutes())) * gridH)
            const isMine = !!myEmail && b.booker_email === myEmail
            const othersClickable = !isMine && (visShowTitle || visShowOrganizer)
            const isBlockPast = !!now && new Date(b.end_time) < now
            const bg     = isBlockPast ? (isMine ? (dark ? '#2e2030' : '#e0c8d0') : (dark ? '#1e222a' : '#c8cdd4')) : isMine ? (dark ? '#5c3747' : '#f5e0e7') : T.blockBg
            const border = isBlockPast ? (isMine ? (dark ? '#3e3048' : '#c0a0b4') : (dark ? '#2a303a' : '#a8b0bc')) : isMine ? ROSE : T.blockBorder
            const label  = isMine ? (b.title || b.booker_name) : visShowTitle ? (b.title || 'Occupied') : visShowOrganizer ? b.booker_name : 'Occupied'
            const textColor = isBlockPast ? T.textFaint : isMine ? (dark ? '#e8b4c4' : '#8a3d58') : (dark ? '#a0b4c8' : '#3d5068')
            return (
              <div key={b.id} onClick={e => { e.stopPropagation(); if (isMine || othersClickable) onBookingClick?.(b) }}
                style={{ position: 'absolute', top: topPx, left: 4, right: 4, height: heightPx, background: bg, borderRadius: 0, cursor: (isMine || othersClickable) && onBookingClick ? 'pointer' : 'default', overflow: 'hidden' }}>
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
function WeekView({ bookings, weekDays, onSlotClick, onBookingClick, pendingSlot, now, dark, myEmail, hourH = HOUR_H, gridStart = GRID_START, gridEnd = GRID_END, visShowTitle = false, visShowOrganizer = false }: {
  bookings: Booking[]; weekDays: Date[];
  onSlotClick?: (date: Date, time: string) => void;
  onBookingClick?: (b: Booking) => void;
  pendingSlot?: { ds: string; startHHMM: string; endHHMM: string } | null;
  now?: Date; dark?: boolean; myEmail?: string; hourH?: number; gridStart?: number; gridEnd?: number; visShowTitle?: boolean; visShowOrganizer?: boolean;
}) {
  const T = mkT(dark ?? false)
  const gridHours = gridEnd - gridStart
  const gridH = hourH * gridHours
  const gp = (h: number, m: number) => toGridPct(h, m, gridStart, gridHours)
  const todayStr = dateStr(new Date())
  const [hoverSlot, setHoverSlot] = useState<{ ds: string; time: string } | null>(null)
  const [chronoFlash, setChronoFlash] = useState(false)

  function flashChrono() {
    setChronoFlash(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setChronoFlash(true)))
    setTimeout(() => setChronoFlash(false), 1800)
  }

  const byDay: Record<string, Booking[]> = {}
  for (const b of bookings) {
    const d = dateStr(new Date(b.start_time))
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(b)
  }

  function snapY(y: number) {
    const totalMins = Math.round((gridStart * 60 + (Math.max(0, Math.min(y, gridH)) / gridH) * gridHours * 60) / 15) * 15
    const h = Math.min(Math.floor(totalMins / 60), gridEnd - 1)
    const m = totalMins % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const hourLabels = Array.from({ length: gridHours + 1 }, (_, i) => {
    const h = gridStart + i
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
              <div style={{ fontSize: 10, color: isToday ? ROSE : isPast ? T.pastText : isWeekend ? '#aa9a80' : T.textMuted, fontWeight: isToday ? 600 : 400 }}>{DAYS_SHORT[colIdx]}</div>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: isToday ? ROSE : 'transparent', color: isToday ? '#fff' : isPast ? T.pastText : isWeekend ? '#8a7a60' : T.text, fontSize: 12, fontWeight: isToday ? 600 : 400, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px auto 0' }}>
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
                  style={{ position: 'relative', height: gridH, overflow: 'hidden', background: colBg, cursor: onSlotClick && !isPast ? 'pointer' : 'default' }}
                  onClick={onSlotClick && !isPast ? (e) => { const rect = e.currentTarget.getBoundingClientRect(); const t = snapY(e.clientY - rect.top); if (isToday && now) { const [h,m] = t.split(':').map(Number); const s = new Date(day); s.setHours(h,m,0,0); if (s < now) { flashChrono(); return } } onSlotClick(day, t) } : undefined}
                  onMouseMove={onSlotClick && !isPast ? (e) => { const rect = e.currentTarget.getBoundingClientRect(); const t = snapY(e.clientY - rect.top); if (isToday && now) { const [h,m] = t.split(':').map(Number); const s = new Date(day); s.setHours(h,m,0,0); if (s < now) { setHoverSlot(null); return } } setHoverSlot({ ds, time: t }) } : undefined}
                  onMouseLeave={() => setHoverSlot(null)}>
                  {Array.from({ length: gridHours }, (_, i) => (
                    <div key={i} style={{ position: 'absolute', top: i * hourH, left: 0, right: 0, height: hourH, background: i % 2 === 0 ? T.bandOdd : 'transparent', borderTop: `0.5px solid ${isPast ? (dark ? 'rgba(255,255,255,0.04)' : '#a8a8a8') : (dark ? 'rgba(255,255,255,0.12)' : '#C8C8C8')}` }} />
                  ))}
                  {hoverSlot?.ds === ds && (() => {
                    const [sh, sm] = hoverSlot.time.split(':').map(Number)
                    return <div style={{ position: 'absolute', top: Math.max(0, gp(sh, sm) * gridH), left: 0, right: 0, height: hourH / 4, background: dark ? 'rgba(219,149,171,0.13)' : 'rgba(44,62,107,0.08)', borderTop: `1px solid ${dark ? 'rgba(219,149,171,0.3)' : 'rgba(44,62,107,0.18)'}`, pointerEvents: 'none', transition: 'top 0.08s ease-out' }} />
                  })()}
                  {pendingSlot?.ds === ds && (() => {
                    const [sh, sm] = pendingSlot.startHHMM.split(':').map(Number)
                    const [eh, em] = pendingSlot.endHHMM.split(':').map(Number)
                    const topPx = Math.max(0, gp(sh, sm) * gridH)
                    const heightPx = Math.max(8, (gp(eh, em) - gp(sh, sm)) * gridH)
                    return <div style={{ position: 'absolute', top: topPx, left: 2, right: 2, height: heightPx, background: 'rgba(148,163,184,0.25)', borderRadius: 4, border: '1.5px dashed #94A3B8', pointerEvents: 'none' }} />
                  })()}
                  {now && isToday && (() => {
                    const pastH = Math.max(0, gp(now.getHours(), now.getMinutes()) * gridH)
                    return pastH > 0 ? <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: pastH, background: dark ? 'rgba(0,0,0,0.50)' : 'rgba(0,0,0,0.30)', pointerEvents: 'none', zIndex: 2 }} /> : null
                  })()}
                  {chronoFlash && isToday && (
                    <div style={{ position: 'absolute', top: '35%', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 9, fontWeight: 600, color: dark ? '#888888' : '#6B7280', letterSpacing: '0.04em', animation: 'chronoFlash 1.8s ease-out forwards' }}>Chronology protection enforced.</span>
                    </div>
                  )}
                  {now && isToday && <NowLine now={now} gridH={gridH} gridStart={gridStart} gridHours={gridHours} />}
                  {dayBookings.map(b => {
                    const bs = new Date(b.start_time), be = new Date(b.end_time)
                    const topPx = Math.max(0, gp(bs.getHours(), bs.getMinutes()) * gridH)
                    const heightPx = Math.max(16, (gp(be.getHours(), be.getMinutes()) - gp(bs.getHours(), bs.getMinutes())) * gridH)
                    const isMine = !!myEmail && b.booker_email === myEmail
                    const othersClickable = !isMine && (visShowTitle || visShowOrganizer)
                    const isBlockPast = !!now && new Date(b.end_time) < now
                    const bg     = isBlockPast ? (isMine ? (dark ? '#2e2030' : '#e0c8d0') : (dark ? '#1e222a' : '#c8cdd4')) : isMine ? (dark ? '#5c3747' : '#f5e0e7') : T.blockBg
                    const border = isBlockPast ? (isMine ? (dark ? '#3e3048' : '#c0a0b4') : (dark ? '#2a303a' : '#a8b0bc')) : isMine ? ROSE : T.blockBorder
                    const label  = isMine ? (b.title || b.booker_name) : visShowTitle ? (b.title || 'Occupied') : visShowOrganizer ? b.booker_name : 'Occupied'
                    const textColor = isBlockPast ? T.textFaint : isMine ? (dark ? '#e8b4c4' : '#8a3d58') : (dark ? '#a0b4c8' : '#3d5068')
                    return (
                      <div key={b.id} onClick={e => { e.stopPropagation(); if (isMine || othersClickable) onBookingClick?.(b) }}
                        style={{ position: 'absolute', top: topPx, left: 2, right: 2, height: heightPx, background: bg, borderRadius: 0, cursor: (isMine || othersClickable) && onBookingClick ? 'pointer' : 'default', overflow: 'hidden' }}>
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
    const d = dateStr(new Date(b.start_time))
    byDay[d] = (byDay[d] ?? 0) + 1
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
        {DAYS_SHORT.map((d, i) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: i >= 5 ? '#aa9a80' : T.textMuted, fontWeight: 500, paddingBottom: 4 }}>{d}</div>
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
            const numColor  = isToday ? '#fff' : isPast ? T.pastText : isWeekend && inMonth ? '#8a7a60' : inMonth ? T.text : T.borderFaint
            return (
              <div key={ds} onClick={() => { if (!isPast) onDayClick(day) }}
                style={{ padding: '6px 4px 8px', minHeight: 64, cursor: isPast ? 'default' : 'pointer', borderRight: di < 6 ? `0.5px solid ${T.colSep}` : 'none', background: isPast ? T.pastBg : cellBg }}>
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
  const { workspace } = useParams<{ workspace: string }>()
  const api = `/api/${workspace}`
  const [rooms,          setRooms]         = useState<Room[]>([])
  const [roomTypes,      setRoomTypes]     = useState<string[]>([])
  const [filterRoomType, setFilterRoomType] = useState('')
  const [sidebarBkgs,   setSidebarBkgs]   = useState<Booking[]>([])
  const [rangeBkgs,     setRangeBkgs]     = useState<Booking[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [busyFlash,     setBusyFlash]     = useState(false)
  const [now,           setNow]           = useState(new Date())
  const [calView,       setCalView]       = useState<CalView>('week')
  const [viewDate,      setViewDate]      = useState(new Date())
  const [theme,         setTheme]         = useState<'light' | 'dark'>('light')
  const [lotr,          setLotr]          = useState(false)
  const lotrQuote = useMemo(() => {
    const quotes = [
      'Courage is found in unlikely places.',
      'Home is behind, the world ahead.',
      'Faithless is he that says farewell when the road darkens.',
      'Moonlight drowns out all but the brightest stars.',
    ]
    return quotes[Math.floor(Math.random() * quotes.length)]
  }, [])
  const [gridStart,     setGridStart]     = useState(8)
  const [gridEnd,       setGridEnd]       = useState(20)

  const [showModal,   setShowModal]   = useState<'now' | 'later' | null>(null)
  const [mName,       setMName]       = useState('')
  const [mEmail,      setMEmail]      = useState('')
  const [mDate,       setMDate]       = useState(() => dateStr(new Date()))
  const [mTitle,      setMTitle]      = useState('')
  const [mTime,       setMTime]       = useState('')
  const [mEndTime,    setMEndTime]    = useState('')
  const [mSubmitting, setMSubmitting] = useState(false)
  const [mDone,       setMDone]       = useState(false)
  const [mError,      setMError]      = useState('')
  const [recurFreq,   setRecurFreq]   = useState<'none' | 'weekly' | 'monthly'>('none')

  // Feedback
  const [showFeedback,    setShowFeedback]    = useState(false)
  const [fbMessage,       setFbMessage]       = useState('')
  const [fbSubmitting,    setFbSubmitting]    = useState(false)
  const [fbDone,          setFbDone]          = useState(false)

  async function submitFeedback() {
    if (!fbMessage.trim()) return
    setFbSubmitting(true)
    await fetch(`/api/${workspace}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: mName, email: mEmail, message: fbMessage }),
    })
    setFbSubmitting(false)
    setFbDone(true)
    setTimeout(() => { setShowFeedback(false); setFbMessage(''); setFbDone(false) }, 2000)
  }
  const [recurUntil,  setRecurUntil]  = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 3); return dateStr(d) })

  // Visibility settings
  const [visShowTitle,     setVisShowTitle]     = useState(false)
  const [visShowOrganizer, setVisShowOrganizer] = useState(false)

  // My bookings panel
  const [showMyBookings,  setShowMyBookings]  = useState(false)
  const [myBkEmail,       setMyBkEmail]       = useState('')
  const [myBkgs,          setMyBkgs]          = useState<any[] | null>(null)
  const [myBkLoading,     setMyBkLoading]     = useState(false)
  const [myBkSelected,    setMyBkSelected]    = useState<Set<string>>(new Set())
  const [myBkCancelling,  setMyBkCancelling]  = useState(false)
  const [myBkCancelConfirm, setMyBkCancelConfirm] = useState(false)
  const [myBkVerifySent,  setMyBkVerifySent]  = useState(false)
  const [verifiedEmail,   setVerifiedEmail]   = useState<string | null>(null)

  // Edit existing booking
  const [editBooking,     setEditBooking]     = useState<Booking | null>(null)
  const [editTitle,       setEditTitle]       = useState('')
  const [editName,        setEditName]        = useState('')
  const [editEmail,       setEditEmail]       = useState('')
  const [editDate,        setEditDate]        = useState('')
  const [editStart,       setEditStart]       = useState('')
  const [editEnd,         setEditEnd]         = useState('')
  const [editSubmitting,  setEditSubmitting]  = useState(false)
  const [editError,       setEditError]       = useState<string | null>(null)
  const [editScopeStep,    setEditScopeStep]    = useState(false)
  const [editConflicts,    setEditConflicts]    = useState<string[]>([])
  const [bookingConflicts,      setBookingConflicts]      = useState<string[]>([])
  const [lastCreatedBooking,    setLastCreatedBooking]    = useState<any>(null)
  const [lastCreatedSeries,     setLastCreatedSeries]     = useState<any>(null)
  const [lastCreatedIsRecurring, setLastCreatedIsRecurring] = useState(false)
  const [lastCreatedRecurFreq,  setLastCreatedRecurFreq]  = useState<string>('none')
  const [pendingReschedules,    setPendingReschedules]    = useState<{ date: string; startHHMM: string; endHHMM: string; title: string }[]>([])
  const [conflictResolutions,   setConflictResolutions]   = useState<{ date: string; nextAvail: { startHHMM: string; endHHMM: string } | null; altRoom: { id: string; name: string } | null; status: 'idle' | 'booking-next' | 'booking-alt' | 'done-next' | 'done-alt' | 'error'; error?: string }[]>([])
  const [conflictResLoading,    setConflictResLoading]    = useState(false)
  const [singleConflict, setSingleConflict] = useState<{
    nextAvail: { startHHMM: string; endHHMM: string } | null
    altRooms: { id: string; name: string }[]
    bookingStatus: 'idle' | 'booking-next' | 'booking-alt' | 'error'
    bookedRoomId?: string
    error?: string
  } | null>(null)
  const [confirmCancel,   setConfirmCancel]   = useState<{ message?: string; onConfirm?: () => void; onConfirmScope?: (scope: 'this' | 'future') => void } | null>(null)
  const [mRoomId,        setMRoomId]        = useState('')
  const [laterDayBkgs,   setLaterDayBkgs]   = useState<Booking[]>([])
  const [laterRoomOpen,  setLaterRoomOpen]  = useState(false)

  const dark = theme === 'dark'
  const T = mkT(dark)

  const todayStr     = dateStr(now)
  const viewDateStr  = dateStr(viewDate)
  const weekDays     = getWeekDays(viewDate)
  const selectedRoom = rooms.find(r => r.id === selectedRoomId) ?? null

  // LOTR text overrides
  const txt = {
    bookNow:    lotr ? '💍 Gather the council'   : 'Book now',
    schedule:   lotr ? '🐴 Send word ahead'      : 'Schedule for later',
    confirm:    lotr ? 'For the Shire! ⚔️'      : 'Confirm booking',
    confirming: lotr ? 'One moment...'           : 'Confirming…',
    confirmed:  lotr ? 'It is done.' : 'Booking confirmed!',
    subtext:    lotr ? 'All we have to decide is what to do with the time that is given us.' : 'Your room is reserved.',
    done:       lotr ? 'Fly, you fools!'         : 'Done',
    available:  lotr ? '⚔️ Available'            : 'Available',
    inUse:      lotr ? '🔥 Occupied'             : 'In Use',
    freeUntil:  (t: string) => lotr ? `Peace reigns until ${t}` : `Free until ${t}`,
    freeAll:    lotr ? 'Peace reigns in the realm' : 'Free until end of day',
    busy:       lotr ? 'Voices fill the hall'    : null,
    myBookings: lotr ? 'My quests'               : 'My bookings',
  }

  function getRange(): { from: string; to: string } {
    if (calView === 'day')  return { from: viewDateStr, to: viewDateStr }
    if (calView === 'week') return { from: dateStr(weekDays[0]), to: dateStr(weekDays[6]) }
    const y = viewDate.getFullYear(), m = viewDate.getMonth()
    return { from: dateStr(new Date(y, m, 1)), to: dateStr(new Date(y, m + 1, 0)) }
  }

  const fetchRooms = useCallback(() => {
    fetch(`${api}/rooms`).then(r => r.json()).then((data: Room[]) => {
      setRooms(data)
      setSelectedRoomId(prev => prev || data[0]?.id || '')
    })
    fetch(`${api}/room-types`).then(r => r.json()).then(setRoomTypes)
  }, [])

  const fetchSidebar = useCallback(() => {
    fetch(`${api}/bookings?date=${todayStr}`).then(r => r.json()).then(setSidebarBkgs)
  }, [todayStr])

  const fetchRange = useCallback(() => {
    if (!selectedRoomId) return
    const { from, to } = getRange()
    fetch(`${api}/bookings?room_id=${selectedRoomId}&from=${from}&to=${to}`)
      .then(r => r.json()).then(setRangeBkgs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId, calView, viewDateStr])

  useEffect(() => { fetchRooms() }, [fetchRooms])
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_MOCK_MODE === 'true') return
    fetch(`${api}/my-bookings-session`).then(r => r.json()).then(({ email }) => { if (email) setVerifiedEmail(email) }).catch(() => {})
  }, [api])
  useEffect(() => {
    if (showModal !== 'later' || !mDate) { setLaterDayBkgs([]); return }
    fetch(`${api}/bookings?date=${mDate}`).then(r => r.json()).then(setLaterDayBkgs).catch(() => {})
  }, [showModal, mDate, api])
  useEffect(() => {
    fetch(`${api}/settings`).then(r => r.json()).then(d => {
      setGridStart(d.displayHours?.start ?? 8)
      setGridEnd(d.displayHours?.end ?? 20)
      setVisShowTitle(d.bookingVisibility?.showTitle ?? false)
      setVisShowOrganizer(d.bookingVisibility?.showOrganizer ?? false)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!filterRoomType) return
    const visible = rooms.filter(r => r.room_type === filterRoomType)
    if (visible.length > 0 && !visible.find(r => r.id === selectedRoomId)) {
      setSelectedRoomId(visible[0].id)
    }
  }, [filterRoomType, rooms])
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
    ? Math.max(28, Math.floor((calContainerH - CAL_PAD - (calView === 'week' ? WEEK_HEADER_H : 0)) / (gridEnd - gridStart)))
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
    setMDate(ds); setMTime(time); setMEndTime(endHHMM); setMTitle('Occupied'); setRecurFreq('none'); setMError(''); setMDone(false); setMRoomId(selectedRoomId); setShowModal('later')
  }

  async function fetchMyBkgs(email: string) {
    setMyBkLoading(true)
    const res = await fetch(`${api}/bookings?email=${encodeURIComponent(email)}`)
    setMyBkgs(await res.json())
    setMyBkLoading(false)
    setMyBkSelected(new Set())
  }

  function openMyBookings() {
    setShowMyBookings(true)
    setMyBkSelected(new Set())
    setMyBkVerifySent(false)
    const emailToUse = mEmail || verifiedEmail
    if (emailToUse) { setMyBkEmail(emailToUse); fetchMyBkgs(emailToUse) }
    else { setMyBkgs(null); setMyBkEmail('') }
  }

  async function cancelMyBkSelected() {
    setMyBkCancelConfirm(true)
  }

  async function confirmMyBkCancel() {
    setMyBkCancelConfirm(false)
    setMyBkCancelling(true)
    await Promise.all(
      (myBkgs ?? []).filter(b => myBkSelected.has(b.id)).map(b =>
        fetch(`/api/cancel/${b.cancel_token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'this' }) })
      )
    )
    setMyBkCancelling(false)
    fetchMyBkgs(myBkEmail)
    fetchSidebar(); fetchRange()
  }

  async function cancelOneMyBk(b: any) {
    if (b.recurring_series_id) {
      setConfirmCancel({ onConfirmScope: async (scope) => {
        setConfirmCancel(null)
        await fetch(`/api/cancel/${b.cancel_token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope }) })
        fetchMyBkgs(myBkEmail)
        fetchSidebar(); fetchRange()
      }})
    } else {
      setConfirmCancel({ message: 'This will cancel the booking.', onConfirm: async () => {
        setConfirmCancel(null)
        await fetch(`/api/cancel/${b.cancel_token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'this' }) })
        fetchMyBkgs(myBkEmail)
        fetchSidebar(); fetchRange()
      }})
    }
  }

  function openEdit(b: Booking) {
    const bs = new Date(b.start_time), be = new Date(b.end_time)
    setEditBooking(b)
    setEditTitle(b.title ?? '')
    setEditName(b.booker_name)
    setEditEmail(b.booker_email)
    setEditDate(dateStr(new Date(b.start_time)))
    setEditStart(`${String(bs.getHours()).padStart(2, '0')}:${String(bs.getMinutes()).padStart(2, '0')}`)
    setEditEnd(`${String(be.getHours()).padStart(2, '0')}:${String(be.getMinutes()).padStart(2, '0')}`)
    setEditError(null)
    setEditScopeStep(false)
  }

  async function handleEditSave() {
    if (!editBooking) return
    if (editBooking.recurring_series_id) { setEditScopeStep(true); return }
    await doEditSave('this')
  }

  async function doEditSave(scope: 'this' | 'future') {
    if (!editBooking) return
    setEditScopeStep(false)
    setEditSubmitting(true)
    setEditError(null)
    const [sh, sm] = editStart.split(':').map(Number)
    const [eh, em] = editEnd.split(':').map(Number)
    const [y, mo, d] = editDate.split('-').map(Number)
    const startIso = new Date(y, mo - 1, d, sh, sm, 0, 0).toISOString()
    const endIso   = new Date(y, mo - 1, d, eh, em, 0, 0).toISOString()
    const res = await fetch(`${api}/bookings/${editBooking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(mEmail && editBooking.booker_email === mEmail ? { title: editTitle || null } : {}),
        booker_name: editName,
        booker_email: editEmail,
        start_time: startIso,
        end_time: endIso,
        _editor_name: mName,
        _editor_email: mEmail,
        _room_name: selectedRoom?.name ?? '',
        _scope: scope,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setEditError(err.error ?? 'That time slot is no longer available.')
      setEditSubmitting(false)
      return
    }
    const result = await res.json()
    const updated = result.conflictDates !== undefined ? result.booking : result
    setRangeBkgs(prev => prev.map(b => b.id === editBooking.id ? updated : b))
    fetchRange()
    fetchSidebar()
    if (result.conflictDates?.length > 0) {
      setEditConflicts(result.conflictDates)
      setEditSubmitting(false)
    } else {
      setEditBooking(null)
      setEditSubmitting(false)
    }
  }

  async function handleEditCancel() {
    if (!editBooking) return
    if (editBooking.recurring_series_id) {
      setConfirmCancel({ onConfirmScope: async (scope) => {
        setConfirmCancel(null)
        await fetch(`/api/cancel/${editBooking.cancel_token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope }) })
        setEditBooking(null)
        fetchRange()
        fetchSidebar()
      }})
    } else {
      setConfirmCancel({ message: 'This will cancel the booking.', onConfirm: async () => {
        setConfirmCancel(null)
        await fetch(`/api/cancel/${editBooking.cancel_token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'this' }) })
        setEditBooking(null)
        fetchRange()
        fetchSidebar()
      }})
    }
  }

  function handleEditFromConfirm() {
    if (!lastCreatedBooking) return
    setShowModal(null)
    setBookingConflicts([])
    openEdit(lastCreatedBooking)
  }

  async function handleConflictBook(date: string, type: 'next' | 'alt') {
    const res = conflictResolutions.find(r => r.date === date)
    if (!res || res.status !== 'idle') return
    const startHHMM = type === 'next' ? res.nextAvail!.startHHMM : mTime
    const endHHMM   = type === 'next' ? res.nextAvail!.endHHMM   : mEndTime
    const roomId    = type === 'alt'  ? res.altRoom!.id           : selectedRoomId
    setConflictResolutions(prev => prev.map(r => r.date === date ? { ...r, status: type === 'next' ? 'booking-next' : 'booking-alt' } : r))
    const bookRes = await fetch(`${api}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, booker_name: mName, booker_email: mEmail, start_time: new Date(`${date}T${startHHMM}`).toISOString(), end_time: new Date(`${date}T${endHHMM}`).toISOString(), title: lastCreatedBooking?.title || null, ...(lastCreatedSeries?.id ? { recurring_series_id: lastCreatedSeries.id } : {}) }),
    })
    if (bookRes.ok) {
      setConflictResolutions(prev => prev.map(r => r.date === date ? { ...r, status: type === 'next' ? 'done-next' : 'done-alt' } : r))
      fetchSidebar(); fetchRange()
    } else {
      const body = await bookRes.json().catch(() => ({}))
      setConflictResolutions(prev => prev.map(r => r.date === date ? { ...r, status: 'error', error: body.error ?? 'Failed to book' } : r))
    }
  }

  async function handleSingleConflictBook(type: 'next' | 'alt', altRoomId?: string) {
    if (!singleConflict) return
    const startHHMM = type === 'next' ? singleConflict.nextAvail!.startHHMM : mTime
    const endHHMM   = type === 'next' ? singleConflict.nextAvail!.endHHMM   : mEndTime
    const roomId    = type === 'alt' ? altRoomId! : (mRoomId || selectedRoomId)
    setSingleConflict(prev => prev ? { ...prev, bookingStatus: type === 'next' ? 'booking-next' : 'booking-alt', bookedRoomId: altRoomId } : null)
    const res = await fetch(`${api}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, booker_name: mName, booker_email: mEmail, start_time: new Date(`${mDate}T${startHHMM}`).toISOString(), end_time: new Date(`${mDate}T${endHHMM}`).toISOString(), title: mTitle || null, origin: 'desktop' }),
    })
    if (res.ok) {
      setSingleConflict(null)
      setMTitle('Occupied'); setMError(''); setMDone(true); fetchSidebar(); fetchRange()
    } else {
      const body = await res.json().catch(() => ({}))
      setSingleConflict(prev => prev ? { ...prev, bookingStatus: 'error', error: body.error ?? 'Failed to book' } : null)
    }
  }

  function handleStartTime(time: string) {
    setSingleConflict(null)
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

  const dayBookings = rangeBkgs.filter(b => dateStr(new Date(b.start_time)) === viewDateStr)

  const selectedRoomTodayBkgs = sidebarBkgs.filter(b => b.room_id === selectedRoomId)
  const isFree = getRoomStatusFull(selectedRoomTodayBkgs).status === 'free'

  const mRoom = rooms.find(r => r.id === mRoomId) ?? selectedRoom

  const laterRoomAvailability = useMemo(() => {
    if (!mTime || !mEndTime) return rooms.map(r => ({ id: r.id, name: r.name, room_type: r.room_type, taken: false }))
    const startMins = toMins(mTime), endMins = toMins(mEndTime)
    return rooms.map(r => ({
      id: r.id, name: r.name, room_type: r.room_type,
      taken: laterDayBkgs.filter(b => b.room_id === r.id && !b.cancelled_at).some(b => {
        const bs = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes()
        const be = new Date(b.end_time).getHours() * 60 + new Date(b.end_time).getMinutes()
        return bs < endMins && be > startMins
      }),
    }))
  }, [rooms, laterDayBkgs, mTime, mEndTime])

  async function handleQuickBook() {
    const bookRoomId = showModal === 'later' ? mRoomId : selectedRoom?.id
    if (!bookRoomId || !mName || !mEmail || !mTime || !mEndTime) return
    setSingleConflict(null)
    setMSubmitting(true)
    const startTime = new Date(`${mDate}T${mTime}`).toISOString()
    const endTime   = new Date(`${mDate}T${mEndTime}`).toISOString()
    if (endTime <= startTime) { setMSubmitting(false); return }
    const jsDay = new Date(`${mDate}T00:00:00`).getDay()
    const isoDay = jsDay === 0 ? 7 : jsDay
    const recurrence = (showModal === 'later' && recurFreq !== 'none') ? {
      frequency: recurFreq,
      days_of_week: recurFreq === 'weekly' ? [isoDay] : undefined,
      series_end: recurUntil,
    } : undefined
    const res = await fetch(`${api}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: bookRoomId, booker_name: mName, booker_email: mEmail, start_time: startTime, end_time: endTime, title: mTitle || null, ...(recurrence ? { recurrence } : {}) }),
    })
    if (res.ok) {
      try { localStorage.setItem('spacebook_user', JSON.stringify({ name: mName, email: mEmail })) } catch {}
      const result = await res.json().catch(() => ({}))
      const conflictDates: string[] = result.conflictDates ?? []
      const capturedTime = mTime; const capturedEndTime = mEndTime
      const capturedRoom = selectedRoom; const capturedRooms = rooms
      setBookingConflicts(conflictDates)
      setLastCreatedBooking(result.booking ?? null)
      setLastCreatedSeries(result.series ?? null)
      setLastCreatedIsRecurring(!!recurrence)
      setLastCreatedRecurFreq(recurrence?.frequency ?? 'none')
      setPendingReschedules(prev => prev.filter(r => r.date !== mDate))
      setConflictResolutions([])
      setMTitle('Occupied'); setRecurFreq('none'); setMError(''); setMDone(true); fetchSidebar(); fetchRange()
      if (conflictDates.length > 0 && capturedRoom) {
        setConflictResLoading(true)
        const minDate = conflictDates.reduce((a, b) => a < b ? a : b)
        const maxDate = conflictDates.reduce((a, b) => a > b ? a : b)
        fetch(`${api}/bookings?from=${minDate}&to=${maxDate}`)
          .then(r => r.json())
          .then((allBkgs: any[]) => {
            const dur = toMins(capturedEndTime) - toMins(capturedTime)
            const resolutions = conflictDates.map(date => {
              const roomBkgs = allBkgs.filter((b: any) => b.room_id === capturedRoom.id && !b.cancelled_at)
              const nextStart = findNextAvailable(date, capturedTime, capturedEndTime, roomBkgs, gridEnd)
              const nextAvail = nextStart ? { startHHMM: nextStart, endHHMM: fromMins(toMins(nextStart) + dur) } : null
              const sameTypeRooms = capturedRooms.filter(r => r.id !== capturedRoom.id && r.room_type && r.room_type === capturedRoom.room_type)
              let altRoom: { id: string; name: string } | null = null
              for (const r of sameTypeRooms) {
                const conflict = allBkgs.filter((b: any) => b.room_id === r.id && !b.cancelled_at && dateStr(new Date(b.start_time)) === date)
                  .some((b: any) => {
                    const bs = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes()
                    const be = new Date(b.end_time).getHours() * 60 + new Date(b.end_time).getMinutes()
                    return bs < toMins(capturedEndTime) && be > toMins(capturedTime)
                  })
                if (!conflict) { altRoom = { id: r.id, name: r.name }; break }
              }
              return { date, nextAvail, altRoom, status: 'idle' as const }
            })
            setConflictResolutions(resolutions)
          })
          .catch(() => setConflictResolutions(conflictDates.map(date => ({ date, nextAvail: null, altRoom: null, status: 'idle' as const }))))
          .finally(() => setConflictResLoading(false))
      }
    } else {
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) {
        const conflictRoom = mRoom
        const conflictRoomId = bookRoomId
        const roomBkgs = laterDayBkgs.length > 0
          ? laterDayBkgs.filter(b => b.room_id === conflictRoomId)
          : rangeBkgs.filter(b => b.room_id === conflictRoomId)
        const next = findNextAvailable(mDate, mTime, mEndTime, roomBkgs, gridEnd)
        const dur = toMins(mEndTime) - toMins(mTime)
        const nextAvail = next ? { startHHMM: next, endHHMM: fromMins(toMins(next) + dur) } : null
        const allDayBkgs: Booking[] = laterDayBkgs.length > 0 ? laterDayBkgs : await fetch(`${api}/bookings?date=${mDate}`).then(r => r.json()).catch(() => [])
        const startMins = toMins(mTime), endMins = toMins(mEndTime)
        const altRooms = rooms
          .filter(r => r.id !== conflictRoomId && r.room_type && r.room_type === conflictRoom?.room_type)
          .filter(r => !allDayBkgs.filter((b: any) => b.room_id === r.id && !b.cancelled_at)
            .some((b: any) => {
              const bs = new Date(b.start_time).getHours() * 60 + new Date(b.start_time).getMinutes()
              const be = new Date(b.end_time).getHours() * 60 + new Date(b.end_time).getMinutes()
              return bs < endMins && be > startMins
            }))
          .map(r => ({ id: r.id, name: r.name }))
        setSingleConflict({ nextAvail, altRooms, bookingStatus: 'idle' })
      } else {
        setMError(body.error ?? 'Something went wrong. Please try again.')
      }
    }
    setMSubmitting(false)
  }

  const inp: React.CSSProperties = { fontSize: 14, padding: '9px 12px', border: `1px solid ${T.inputBorder}`, borderRadius: 0, outline: 'none', fontFamily: 'inherit', width: '100%', background: T.inputBg, color: T.inpText, colorScheme: dark ? 'dark' : 'light' }
  const lbl: React.CSSProperties = { fontSize: 10, color: T.textMuted, fontWeight: 600, display: 'block', marginBottom: 5, letterSpacing: '0.08em', textTransform: 'uppercase' as const }
  const timeInvalid = !!(mTime && mEndTime && mEndTime <= mTime)
  const roseGrad = ROSE

  const toggleBtn: React.CSSProperties = { background: 'rgba(255,255,255,0.1)', border: '0.5px solid rgba(255,255,255,0.18)', borderRadius: 0, padding: '5px 11px', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }

  return (
    <div style={{ background: T.pageBg, height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;1,400&display=swap');@import url('https://fonts.googleapis.com/css2?family=Uncial+Antiqua&display=block');*{transition:background-color 0.25s ease,color 0.2s ease,border-color 0.2s ease,box-shadow 0.2s ease}@keyframes tabShine{0%,100%{border-bottom-color:rgba(219,149,171,0.6)}50%{border-bottom-color:rgba(219,149,171,1)}}@keyframes chronoFlash{0%{opacity:0;transform:translateY(3px)}12%{opacity:1;transform:translateY(0)}70%{opacity:1}100%{opacity:0}}` }} />

      {/* Top bar */}
      <div style={{ background: T.navBg, padding: '14px 24px', display: 'flex', alignItems: 'center', borderBottom: T.navBorder }}>

        {/* Logo */}
        <div style={{ fontSize: 17, fontWeight: 500, color: T.navText, flexShrink: 0, letterSpacing: '0.02em', fontFamily: "'Spectral', Georgia, serif" }}>
          space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
          {lotr && <span style={{ fontSize: 13, marginLeft: 5 }}>🧙</span>}
        </div>

        {/* LOTR quote */}
        {lotr && (
          <div style={{ position: 'absolute', left: 160, right: 'calc(50% - 30px)', textAlign: 'center', fontFamily: "'Uncial Antiqua', cursive", fontSize: 14, color: T.textFaint, pointerEvents: 'none', userSelect: 'none', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', animation: 'none' }}>
            {lotrQuote}
          </div>
        )}

        {/* View tabs — centered over the calendar column (offset by half sidebar width) */}
        <div style={{ position: 'absolute', left: 'calc(50% + 100px)', transform: 'translateX(-50%)', display: 'flex', gap: 22, zIndex: 1 }}>
          {(['day', 'week', 'month'] as CalView[]).map(v => (
            <button key={v} onClick={() => { setCalView(v); setViewDate(new Date()) }}
              style={{ fontSize: 12, padding: '0 0 5px', border: 'none', borderBottom: calView === v ? '1.5px solid rgba(219,149,171,0.35)' : '1.5px solid transparent', animation: calView === v ? 'tabShine 6s ease-in-out infinite' : undefined, cursor: 'pointer', fontFamily: 'inherit', fontWeight: calView === v ? 600 : 400, background: 'transparent', color: calView === v ? T.navText : T.navSub, transition: 'color .15s', letterSpacing: '0.1em', textTransform: 'uppercase' as const, lineHeight: 1 }}>
              {v}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', zIndex: 1 }}>
          {/* Theme slider */}
          <div onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            title={dark ? 'Light mode' : 'Dark mode'}
            style={{ width: 34, height: 18, borderRadius: 0, background: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)', border: dark ? '0.5px solid rgba(255,255,255,0.22)' : '0.5px solid rgba(28,21,16,0.25)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, left: dark ? 16 : 2, width: 14, height: 14, borderRadius: 0, background: dark ? '#fff' : '#1c1510', transition: 'left .18s' }} />
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
            <button onClick={() => shiftView(-1)} style={{ background: 'none', border: `0.5px solid ${T.border}`, borderRadius: 0, padding: '3px 10px', cursor: 'pointer', fontSize: 14, color: T.textMuted }}>‹</button>
            {(() => {
              const isCurrent =
                (calView === 'week'  && todayStr >= dateStr(weekDays[0]) && todayStr <= dateStr(weekDays[6])) ||
                (calView === 'day'   && viewDateStr === todayStr) ||
                (calView === 'month' && viewDate.getFullYear() === now.getFullYear() && viewDate.getMonth() === now.getMonth())
              return (
                <span style={{ fontSize: 13, fontWeight: 500, minWidth: 180, textAlign: 'center', color: isCurrent ? ROSE : dark ? T.text : NAVY, background: isCurrent ? 'rgba(219,149,171,0.12)' : 'transparent', borderRadius: 0, padding: '2px 10px' }}>
                  {navLabel()}
                </span>
              )
            })()}
            <button onClick={() => shiftView(1)} style={{ background: 'none', border: `0.5px solid ${T.border}`, borderRadius: 0, padding: '3px 10px', cursor: 'pointer', fontSize: 14, color: T.textMuted }}>›</button>
          </div>
        </div>

        {/* [1,0] Sidebar rooms list */}
        <div style={{ background: T.cardBg, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {pendingReschedules.length > 0 && (
            <div style={{ padding: '9px 12px', borderBottom: `1px solid ${dark ? 'rgba(253,211,77,0.25)' : '#FDE68A'}`, background: dark ? 'rgba(251,191,36,0.08)' : '#FFFBEB', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: dark ? '#FCD34D' : '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {pendingReschedules.length} date{pendingReschedules.length !== 1 ? 's' : ''} to book
                </div>
                <button onClick={() => setPendingReschedules([])}
                  style={{ background: 'none', border: 'none', fontSize: 14, color: dark ? '#FCD34D' : '#92400E', cursor: 'pointer', padding: '0 2px', lineHeight: 1, opacity: 0.5 }}>×</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {pendingReschedules.map(slot => (
                  <button key={slot.date} onClick={() => {
                    setViewDate(new Date(slot.date + 'T12:00:00'))
                    setMDate(slot.date); setMTime(slot.startHHMM); setMEndTime(slot.endHHMM)
                    setMTitle(slot.title || 'Occupied'); setRecurFreq('none'); setMError(''); setMDone(false); setMRoomId(selectedRoomId)
                    setShowModal('later')
                  }}
                    style={{ fontSize: 10, padding: '3px 8px', background: dark ? 'rgba(253,211,77,0.15)' : '#FEF3C7', border: `1px solid ${dark ? 'rgba(253,211,77,0.3)' : '#FCD34D'}`, color: dark ? '#FCD34D' : '#78350F', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 0 }}>
                    {new Date(slot.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </button>
                ))}
              </div>
            </div>
          )}
          {roomTypes.length > 0 && (
            <div style={{ padding: '8px 14px 4px', display: 'flex', flexWrap: 'wrap', gap: 4, borderBottom: `1px solid ${T.borderFaint}` }}>
              <button onClick={() => setFilterRoomType('')}
                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 0, border: `1px solid ${!filterRoomType ? T.activeBorder : T.border}`, background: !filterRoomType ? T.activeRoom : 'transparent', cursor: 'pointer', color: !filterRoomType ? FREE_TEXT : T.textMuted, fontFamily: 'inherit' }}>
                All
              </button>
              {roomTypes.map(t => (
                <button key={t} onClick={() => setFilterRoomType(filterRoomType === t ? '' : t)}
                  style={{ fontSize: 10, padding: '3px 8px', borderRadius: 0, border: `1px solid ${filterRoomType === t ? T.activeBorder : T.border}`, background: filterRoomType === t ? T.activeRoom : 'transparent', cursor: 'pointer', color: filterRoomType === t ? FREE_TEXT : T.textMuted, fontFamily: 'inherit' }}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <div style={{ padding: '8px 14px', flex: 1 }}>
            {rooms
              .filter(r => !filterRoomType || r.room_type === filterRoomType)
              .map(room => {
                const { status, until } = getRoomStatusFull(sidebarBkgs.filter(b => b.room_id === room.id))
                const isBusy = status === 'busy'
                const dot = isBusy ? '#DC2626' : FREE_BAR
                const active = room.id === selectedRoomId
                return (
                  <div key={room.id} onClick={() => setSelectedRoomId(room.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 0, cursor: 'pointer', marginBottom: 1, background: active ? T.activeRoom : 'transparent', border: active ? `1px solid ${T.activeBorder}` : '1px solid transparent', transition: 'background 0.12s ease-out, border-color 0.12s ease-out' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: T.text, fontWeight: active ? 600 : 400, letterSpacing: active ? '-0.01em' : 0 }}>{room.name}</div>
                      {room.room_type && <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 1 }}>{room.room_type}</div>}
                      <div style={{ fontSize: 10, color: T.textFaint }}>{room.capacity} people</div>
                      <div style={{ fontSize: 10, color: isBusy ? '#DC2626' : T.textMuted, letterSpacing: '0.03em' }}>{isBusy ? (txt.busy ?? `In use · free at ${until}`) : (until === 'end of day' ? txt.freeAll : txt.freeUntil(until))}</div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        {/* [1,1] Calendar */}
        <div ref={calRef} style={{ padding: '16px 20px', overflow: 'auto' }}>
          {calView === 'day'   && <DayView   bookings={dayBookings} viewDate={viewDate} onSlotClick={openScheduleLater} onBookingClick={openEdit} pendingSlot={pendingSlot} now={now} dark={dark} myEmail={mEmail} hourH={dynHourH} gridStart={gridStart} gridEnd={gridEnd} visShowTitle={visShowTitle} visShowOrganizer={visShowOrganizer} />}
          {calView === 'week'  && <WeekView  bookings={rangeBkgs}   weekDays={weekDays} onSlotClick={openScheduleLater} onBookingClick={openEdit} pendingSlot={pendingSlot} now={now} dark={dark} myEmail={mEmail} hourH={dynHourH} gridStart={gridStart} gridEnd={gridEnd} visShowTitle={visShowTitle} visShowOrganizer={visShowOrganizer} />}
          {calView === 'month' && <MonthView bookings={rangeBkgs}   viewDate={viewDate} onDayClick={d => { setViewDate(d); setCalView('day') }} dark={dark} />}
        </div>

        {/* [2,0] Sidebar footer */}
        <div style={{ background: T.cardBg }} />

        {/* [2,1] Bottom bar */}
        <div style={{ background: T.cardBg, padding: '12px 24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  if (!isFree) { setBusyFlash(true); setTimeout(() => setBusyFlash(false), 2200); return }
                  const t = toHHMMExact(new Date())
                  const [h, m] = t.split(':').map(Number)
                  const et = Math.min(h * 60 + m + 60, 23 * 60)
                  setMDate(todayStr); setMTime(t)
                  setMEndTime(`${String(Math.floor(et / 60)).padStart(2, '0')}:${String(et % 60).padStart(2, '0')}`)
                  setMError(''); setShowModal('now'); setMDone(false)
                }}
                style={{ background: isFree ? roseGrad : 'transparent', color: isFree ? '#fff' : T.textMuted, border: isFree ? 'none' : `1px solid ${T.inputBorder}`, borderRadius: 0, padding: '12px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.02em', textDecoration: isFree ? 'none' : 'line-through' }}>
                {txt.bookNow}
              </button>
              {busyFlash && (
                <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', fontSize: 12, padding: '7px 14px', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                  {getRoomStatusFull(sidebarBkgs.filter(b => b.room_id === selectedRoomId)).until !== 'end of day'
                    ? `In use — free at ${getRoomStatusFull(sidebarBkgs.filter(b => b.room_id === selectedRoomId)).until}`
                    : 'Room is currently in use'}
                </div>
              )}
            </div>
            <button onClick={() => { setMDate(todayStr); setMTime(''); setMEndTime(''); setMTitle('Occupied'); setRecurFreq('none'); setMError(''); setShowModal('later'); setMDone(false) }}
              style={{ background: 'transparent', border: `1px solid ${dark ? 'rgba(255,255,255,0.45)' : T.inputBorder}`, borderRadius: 0, padding: '12px 22px', fontSize: 14, cursor: 'pointer', color: T.text, whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>
              {txt.schedule}
            </button>
          </div>
          <button onClick={openMyBookings}
            style={{ background: 'transparent', border: 'none', padding: '12px 10px', fontSize: 13, cursor: 'pointer', color: dark ? 'rgba(255,255,255,0.35)' : T.textMuted, letterSpacing: '0.01em', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {txt.myBookings}
          </button>
        </div>

      </div>

      {/* Modal */}
      {showModal && (
        <div onClick={() => { setShowModal(null); setSingleConflict(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.modalBg, borderRadius: 0, padding: 28, width: mDone && bookingConflicts.length > 0 ? 580 : 370, border: `1px solid ${T.modalBorder}`, boxShadow: dark ? '0 24px 64px rgba(0,0,0,0.6)' : '0 12px 48px rgba(0,0,0,0.18)', transition: 'width 0.2s ease' }}>
            {mDone ? (
              <div style={{ textAlign: 'center', position: 'relative' }}>
                {lotr && (
                  <>
                    <style dangerouslySetInnerHTML={{ __html: `@keyframes spark{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--stx),var(--sty)) scale(0.1);opacity:0}}` }} />
                    <div style={{ position: 'absolute', top: '20%', left: '50%', pointerEvents: 'none' }}>
                      {FIREWORK_PARTICLES.map((p, i) => (
                        <div key={i} style={{ position: 'absolute', width: p.size, height: p.size, borderRadius: '50%', background: p.color, animationName: 'spark', animationDuration: `${p.duration}s`, animationTimingFunction: 'ease-out', animationDelay: `${p.delay}s`, animationFillMode: 'forwards', '--stx': `${p.tx}px`, '--sty': `${p.ty}px` } as React.CSSProperties} />
                      ))}
                    </div>
                  </>
                )}
                <div style={{ fontSize: 16, fontWeight: 500, color: dark ? T.text : NAVY, marginBottom: 8 }}>
                  {lotr ? txt.confirmed : (lastCreatedIsRecurring ? 'Series created' : 'Reserved')}
                </div>
                <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 16 }}>
                  {lotr ? txt.subtext : lastCreatedIsRecurring
                    ? `From ${new Date(mDate + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(mTime)}–${fmtTime(mEndTime)}, repeating ${lastCreatedRecurFreq}`
                    : `${new Date(mDate + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(mTime)}–${fmtTime(mEndTime)}`
                  }
                </div>
                {bookingConflicts.length > 0 && (
                  <div style={{ textAlign: 'left', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: dark ? T.text : NAVY }}>
                        {bookingConflicts.length} date{bookingConflicts.length !== 1 ? 's' : ''} couldn't be booked
                      </div>
                      {conflictResLoading && <div style={{ fontSize: 11, color: T.textMuted }}>Finding alternatives…</div>}
                    </div>
                    {/* Column headers — only show when resolutions loaded */}
                    {conflictResolutions.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, paddingBottom: 6, borderBottom: `1px solid ${T.borderFaint}`, marginBottom: 2 }}>
                        <div style={{ width: 80, flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Next available</div>
                        <div style={{ flex: 1, fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Alternate available {selectedRoom?.room_type || 'room'}</div>
                      </div>
                    )}
                    {conflictResLoading && bookingConflicts.map(d => (
                      <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${T.borderFaint}` }}>
                        <div style={{ width: 80, flexShrink: 0, fontSize: 12, fontWeight: 500, color: T.text }}>
                          {new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </div>
                        <div style={{ flex: 1, fontSize: 11, color: T.textMuted }}>—</div>
                        <div style={{ flex: 1, fontSize: 11, color: T.textMuted }}>—</div>
                      </div>
                    ))}
                    {conflictResolutions.map(res => {
                      const done = res.status === 'done-next' || res.status === 'done-alt'
                      const busy = res.status === 'booking-next' || res.status === 'booking-alt'
                      const fmtD = new Date(res.date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
                      const btnStyle = (active: boolean): React.CSSProperties => ({
                        fontSize: 11, padding: '3px 9px', border: 'none', cursor: active ? 'pointer' : 'default',
                        fontFamily: 'inherit', background: active ? ROSE : T.borderFaint, color: active ? '#fff' : T.textMuted,
                        flexShrink: 0, whiteSpace: 'nowrap',
                      })
                      return (
                        <div key={res.date} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${T.borderFaint}`, opacity: done ? 0.45 : 1 }}>
                          <div style={{ width: 80, flexShrink: 0, fontSize: 12, fontWeight: 500, color: T.text }}>
                            {done ? <span style={{ color: '#15803D' }}>✓ </span> : null}{fmtD}
                          </div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            {res.nextAvail ? (
                              <>
                                <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' }}>{fmtTime(res.nextAvail.startHHMM)}–{fmtTime(res.nextAvail.endHHMM)}</span>
                                <button onClick={() => handleConflictBook(res.date, 'next')} disabled={done || busy}
                                  style={btnStyle(!done && !busy && res.status !== 'error')}>
                                  {res.status === 'booking-next' ? '…' : 'Book'}
                                </button>
                              </>
                            ) : <span style={{ fontSize: 11, color: T.textFaint }}>—</span>}
                          </div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            {res.altRoom ? (
                              <>
                                <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtTime(mTime)}–{fmtTime(mEndTime)}</span>
                                <span style={{ fontSize: 11, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{res.altRoom.name}</span>
                                <button onClick={() => handleConflictBook(res.date, 'alt')} disabled={done || busy}
                                  style={btnStyle(!done && !busy && res.status !== 'error')}>
                                  {res.status === 'booking-alt' ? '…' : 'Book'}
                                </button>
                              </>
                            ) : <span style={{ fontSize: 11, color: T.textFaint }}>—</span>}
                          </div>
                          {res.status === 'error' && <div style={{ fontSize: 10, color: '#DC2626', flexShrink: 0 }}>{res.error}</div>}
                        </div>
                      )
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {lastCreatedBooking && (
                    <button onClick={handleEditFromConfirm}
                      style={{ background: 'none', border: `1px solid ${T.border}`, color: T.text, borderRadius: 0, padding: '10px 20px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {lastCreatedIsRecurring ? 'Edit series' : 'Edit'}
                    </button>
                  )}
                  <button onClick={() => {
                    const unresolved = conflictResolutions.length > 0
                      ? conflictResolutions.filter(r => r.status !== 'done-next' && r.status !== 'done-alt').map(r => r.date)
                      : bookingConflicts
                    if (unresolved.length > 0) {
                      setPendingReschedules(prev => {
                        const existing = new Set(prev.map(r => r.date))
                        return [...prev, ...unresolved.filter(d => !existing.has(d)).map(d => ({ date: d, startHHMM: mTime, endHHMM: mEndTime, title: lastCreatedBooking?.title || '' }))]
                      })
                    }
                    setShowModal(null); setBookingConflicts([]); setLastCreatedBooking(null); setLastCreatedSeries(null); setConflictResolutions([])
                  }}
                    style={{ background: bookingConflicts.length > 0 && (conflictResLoading || conflictResolutions.some(r => r.status !== 'done-next' && r.status !== 'done-alt')) ? (dark ? '#4B5563' : '#D1D5DB') : ROSE, color: bookingConflicts.length > 0 && (conflictResLoading || conflictResolutions.some(r => r.status !== 'done-next' && r.status !== 'done-alt')) ? (dark ? '#9CA3AF' : '#6B7280') : '#fff', border: 'none', borderRadius: 0, padding: '10px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {lotr ? txt.done : 'OK'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20, color: dark ? T.text : NAVY, letterSpacing: '-0.02em' }}>
                  {showModal === 'now' ? txt.bookNow : 'Schedule'} <span style={{ color: ROSE }}>·</span> {showModal === 'later' ? (mRoom?.name ?? selectedRoom?.name) : selectedRoom?.name}
                </div>
                {showModal === 'later' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Date</label>
                    <input style={inp} type="date" value={mDate} onChange={e => { setMDate(e.target.value); setSingleConflict(null) }} />
                  </div>
                )}
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Your name</label>
                  <NameAutocomplete
                    value={mName}
                    onChange={setMName}
                    onSelect={u => { setMName(u.name); setMEmail(u.email) }}
                    workspace={workspace}
                    style={inp}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Email</label>
                  <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>Not visible to others</div>
                  <input style={inp} type="email" placeholder="you@example.com" value={mEmail} onChange={e => setMEmail(e.target.value)} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Title</label>
                  {visShowTitle && <div style={{ fontSize: 11, color: '#C0392B', fontWeight: 600, marginBottom: 6 }}>⚠ Everyone can see this</div>}
                  <input style={inp} placeholder="e.g. Team standup" value={mTitle} onChange={e => setMTitle(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: timeInvalid ? 8 : 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Start time</label>
                    <TimePicker value={mTime} onChange={handleStartTime} dark={dark} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>End time</label>
                    <TimePicker value={mEndTime} onChange={v => { setMEndTime(v); setSingleConflict(null) }} dark={dark} />
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
                          style={{ flex: 1, padding: '6px 0', fontSize: 12, borderRadius: 0, border: `0.5px solid ${recurFreq === f ? ROSE : T.inputBorder}`, cursor: 'pointer', fontFamily: 'inherit', background: recurFreq === f ? ROSE : 'transparent', color: recurFreq === f ? '#fff' : T.text, fontWeight: recurFreq === f ? 600 : 400, transition: 'all .15s' }}>
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
                {showModal === 'later' && (() => {
                  const sel = laterRoomAvailability.find(r => r.id === mRoomId)
                  const types = [...new Set(laterRoomAvailability.map(r => r.room_type).filter(Boolean))] as string[]
                  const untyped = laterRoomAvailability.filter(r => !r.room_type)
                  const CONFLICT = '#C0392B'
                  const AVAIL = dark ? '#6ee7a0' : '#15803d'
                  const hasTimeData = !!(mTime && mEndTime && !timeInvalid)
                  return (
                    <div style={{ marginBottom: 12, position: 'relative' }}>
                      <label style={lbl}>Room</label>
                      <button
                        type="button"
                        onClick={() => setLaterRoomOpen(o => !o)}
                        style={{ ...inp, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', color: sel?.taken ? CONFLICT : T.inpText, textAlign: 'left', gap: 8 }}
                      >
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sel?.name ?? '—'}
                        </span>
                        {sel?.taken && <span style={{ fontSize: 11, fontWeight: 600, color: CONFLICT, flexShrink: 0 }}>conflict</span>}
                        <span style={{ fontSize: 10, color: T.textMuted, flexShrink: 0 }}>▾</span>
                      </button>
                      {laterRoomOpen && (
                        <>
                          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setLaterRoomOpen(false)} />
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 11, background: T.modalBg, border: `1px solid ${T.inputBorder}`, boxShadow: dark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto' }}>
                            {types.map((type, ti) => (
                              <div key={type}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, padding: `${ti === 0 ? 6 : 10}px 12px 3px`, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{type}</div>
                                {laterRoomAvailability.filter(r => r.room_type === type).map(r => (
                                  <div key={r.id} onClick={() => { setMRoomId(r.id); setSingleConflict(null); setLaterRoomOpen(false) }}
                                    style={{ padding: '7px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: r.id === mRoomId ? (dark ? 'rgba(255,255,255,0.06)' : '#f3f4f6') : 'transparent', gap: 8 }}>
                                    <span style={{ fontSize: 13, color: r.taken ? CONFLICT : T.text }}>{r.name}</span>
                                    {r.taken
                                      ? <span style={{ fontSize: 11, fontWeight: 600, color: CONFLICT, flexShrink: 0 }}>conflict</span>
                                      : hasTimeData && <span style={{ fontSize: 11, fontWeight: 500, color: AVAIL, flexShrink: 0 }}>available</span>}
                                  </div>
                                ))}
                              </div>
                            ))}
                            {untyped.map(r => (
                              <div key={r.id} onClick={() => { setMRoomId(r.id); setSingleConflict(null); setLaterRoomOpen(false) }}
                                style={{ padding: '7px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: r.id === mRoomId ? (dark ? 'rgba(255,255,255,0.06)' : '#f3f4f6') : 'transparent', gap: 8 }}>
                                <span style={{ fontSize: 13, color: r.taken ? CONFLICT : T.text }}>{r.name}</span>
                                {r.taken
                                  ? <span style={{ fontSize: 11, fontWeight: 600, color: CONFLICT, flexShrink: 0 }}>conflict</span>
                                  : hasTimeData && <span style={{ fontSize: 11, fontWeight: 500, color: AVAIL, flexShrink: 0 }}>available</span>}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })()}
                {singleConflict ? (
                  <div style={{ marginBottom: 12, border: `1px solid #f5c6c6`, borderRadius: 0 }}>
                    {/* Header */}
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#B94040', padding: '8px 12px', background: '#fdf2f2', borderBottom: `1px solid #f5c6c6`, letterSpacing: '0.03em' }}>
                      That slot is taken — pick an alternative
                    </div>

                    {/* Section 1: different time, same room */}
                    {singleConflict.nextAvail && (
                      <div style={{ borderBottom: singleConflict.altRooms.length > 0 ? `2px solid ${dark ? '#374151' : '#e5e7eb'}` : 'none' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, padding: '7px 12px 4px', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                          Different time · {mRoom?.name ?? selectedRoom?.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 10px', gap: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{fmtTime(singleConflict.nextAvail.startHHMM)}–{fmtTime(singleConflict.nextAvail.endHHMM)}</div>
                          <button onClick={() => handleSingleConflictBook('next')} disabled={singleConflict.bookingStatus !== 'idle'}
                            style={{ fontSize: 11, padding: '5px 14px', border: 'none', background: ROSE, color: '#fff', cursor: singleConflict.bookingStatus !== 'idle' ? 'default' : 'pointer', opacity: singleConflict.bookingStatus !== 'idle' ? 0.6 : 1, flexShrink: 0, fontFamily: 'inherit', fontWeight: 500 }}>
                            {singleConflict.bookingStatus === 'booking-next' ? '…' : 'Book'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Section 2: same time, alt rooms */}
                    {singleConflict.altRooms.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, padding: '7px 12px 4px', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                          Same time · {mRoom?.room_type || selectedRoom?.room_type || 'same type'}
                        </div>
                        {singleConflict.altRooms.map((r, i) => (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderTop: i > 0 ? `0.5px solid ${T.borderFaint}` : 'none', gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{r.name}</div>
                              <div style={{ fontSize: 11, color: T.textMuted }}>{fmtTime(mTime)}–{fmtTime(mEndTime)}</div>
                            </div>
                            <button onClick={() => handleSingleConflictBook('alt', r.id)} disabled={singleConflict.bookingStatus !== 'idle'}
                              style={{ fontSize: 11, padding: '5px 14px', border: 'none', background: ROSE, color: '#fff', cursor: singleConflict.bookingStatus !== 'idle' ? 'default' : 'pointer', opacity: singleConflict.bookingStatus !== 'idle' ? 0.6 : 1, flexShrink: 0, fontFamily: 'inherit', fontWeight: 500 }}>
                              {singleConflict.bookingStatus === 'booking-alt' && singleConflict.bookedRoomId === r.id ? '…' : 'Book'}
                            </button>
                          </div>
                        ))}
                        <div style={{ height: 6 }} />
                      </div>
                    )}

                    {!singleConflict.nextAvail && singleConflict.altRooms.length === 0 && (
                      <div style={{ fontSize: 12, color: T.textMuted, padding: '10px 12px' }}>No alternatives available for this time.</div>
                    )}
                    {singleConflict.error && (
                      <div style={{ fontSize: 12, color: '#B94040', padding: '4px 12px 8px' }}>{singleConflict.error}</div>
                    )}
                  </div>
                ) : mError ? (
                  <div style={{ fontSize: 12, color: '#B94040', background: '#fdf2f2', border: '0.5px solid #f5c6c6', borderRadius: 0, padding: '8px 12px', marginBottom: 12 }}>{mError}</div>
                ) : null}
                <button onClick={handleQuickBook} disabled={mSubmitting || !mName || !mEmail || !mTime || !mEndTime || timeInvalid || (showModal === 'later' && recurFreq !== 'none' && !recurUntil)}
                  style={{ width: '100%', background: mSubmitting ? '#e8bdc7' : roseGrad, color: '#fff', border: 'none', borderRadius: 0, padding: '13px', fontSize: 14, fontWeight: 600, cursor: (mSubmitting || timeInvalid) ? 'default' : 'pointer', letterSpacing: '0.02em', marginTop: 4 }}>
                  {mSubmitting ? txt.confirming : txt.confirm}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* My bookings modal */}
      {showMyBookings && (() => {
        const now2 = new Date()
        const upcoming = (myBkgs ?? []).filter(b => new Date(b.start_time) >= now2)
        const past     = (myBkgs ?? []).filter(b => new Date(b.start_time) <  now2)
        const fmtRow = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
        const fmtT   = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const allUpcomingSelected = upcoming.length > 0 && upcoming.every(b => myBkSelected.has(b.id))
        return (
          <div onClick={() => setShowMyBookings(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: T.modalBg, borderRadius: 0, width: 540, maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: `1px solid ${T.modalBorder}`, boxShadow: dark ? '0 24px 64px rgba(0,0,0,0.6)' : '0 12px 48px rgba(0,0,0,0.18)' }}>
              {/* Header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${T.borderFaint}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: dark ? T.text : NAVY, letterSpacing: '-0.02em' }}>{txt.myBookings}</div>
                <button onClick={() => setShowMyBookings(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.textMuted, lineHeight: 1, padding: '0 4px' }}>×</button>
              </div>

              {/* Lookup form (shown when no email yet) */}
              {!myBkgs && !myBkLoading && (
                <div style={{ padding: '20px 24px' }}>
                  {myBkVerifySent ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 6 }}>Check your email</div>
                      <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 16 }}>We sent a link to <strong>{myBkEmail}</strong>. Click it to view your bookings.</div>
                      <button onClick={() => setMyBkVerifySent(false)}
                        style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, textDecoration: 'underline', textUnderlineOffset: 2, padding: 0 }}>
                        Use a different email
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 12 }}>Enter your email and we'll send you a link to view your bookings.</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          autoFocus
                          type="email"
                          placeholder="your@email.com"
                          value={myBkEmail}
                          onChange={e => setMyBkEmail(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && myBkEmail.trim()) {
                              fetch(`${api}/my-bookings-verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: myBkEmail.trim().toLowerCase() }) }).catch(() => {})
                              setMyBkVerifySent(true)
                            }
                          }}
                          style={{ ...inp, flex: 1 }}
                        />
                        <button onClick={() => {
                          if (!myBkEmail.trim()) return
                          fetch(`${api}/my-bookings-verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: myBkEmail.trim().toLowerCase() }) }).catch(() => {})
                          setMyBkVerifySent(true)
                        }}
                          style={{ background: ROSE, color: '#fff', border: 'none', borderRadius: 0, padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                          Send link
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {myBkLoading && (
                <div style={{ padding: '32px 24px', textAlign: 'center', fontSize: 13, color: T.textMuted }}>Loading…</div>
              )}

              {myBkgs && !myBkLoading && (
                <>
                  {/* Sub-header: email + batch cancel */}
                  <div style={{ padding: '10px 24px', borderBottom: `1px solid ${T.borderFaint}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: T.textMuted, flex: 1 }}>{myBkEmail}</span>
                    <button onClick={() => { setMyBkgs(null); setMyBkEmail('') }}
                      style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, textDecoration: 'underline', textUnderlineOffset: 2, padding: 0 }}>
                      Change
                    </button>
                    {myBkSelected.size > 0 && (
                      <button onClick={cancelMyBkSelected} disabled={myBkCancelling}
                        style={{ fontSize: 12, padding: '4px 12px', border: '1px solid rgba(185,64,64,0.4)', background: 'rgba(185,64,64,0.08)', color: '#B94040', cursor: 'pointer', borderRadius: 0 }}>
                        {myBkCancelling ? 'Cancelling…' : `Cancel ${myBkSelected.size} selected`}
                      </button>
                    )}
                  </div>

                  {/* Scrollable list */}
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {myBkgs.length === 0 ? (
                      <div style={{ padding: '32px 24px', textAlign: 'center', fontSize: 13, color: T.textMuted }}>No bookings found for this email.</div>
                    ) : (
                      <>
                        {/* Upcoming */}
                        {upcoming.length > 0 && (
                          <div>
                            <div style={{ padding: '10px 24px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input type="checkbox" checked={allUpcomingSelected}
                                ref={el => { if (el) el.indeterminate = myBkSelected.size > 0 && !allUpcomingSelected }}
                                onChange={e => setMyBkSelected(e.target.checked ? new Set(upcoming.map(b => b.id)) : new Set())}
                              />
                              <span style={{ fontSize: 11, fontWeight: 500, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Upcoming · {upcoming.length}</span>
                            </div>
                            {upcoming.map(b => {
                              const room = rooms.find(r => r.id === b.room_id)
                              const sel = myBkSelected.has(b.id)
                              return (
                                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 24px', borderTop: `1px solid ${T.borderFaint}`, background: sel ? (dark ? 'rgba(219,149,171,0.07)' : 'rgba(219,149,171,0.06)') : 'transparent' }}>
                                  <input type="checkbox" checked={sel} onChange={e => setMyBkSelected(prev => { const s = new Set(prev); e.target.checked ? s.add(b.id) : s.delete(b.id); return s })} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{room?.name ?? '—'}</div>
                                    <div style={{ fontSize: 12, color: T.textMuted }}>{fmtRow(b.start_time)} · {fmtT(b.start_time)}–{fmtT(b.end_time)}</div>
                                    {b.title && <div style={{ fontSize: 11, color: T.textFaint }}>{b.title}</div>}
                                    {b.recurring_series_id && <div style={{ fontSize: 10, color: ROSE, marginTop: 1 }}>recurring</div>}
                                  </div>
                                  <button onClick={() => { setShowMyBookings(false); openEdit(b as any) }}
                                    style={{ fontSize: 12, padding: '4px 9px', border: `1px solid ${T.border}`, background: 'none', cursor: 'pointer', color: T.textMuted, borderRadius: 0, whiteSpace: 'nowrap' }}>
                                    Edit
                                  </button>
                                  <button onClick={() => cancelOneMyBk(b)}
                                    style={{ fontSize: 12, padding: '4px 9px', border: '1px solid rgba(185,64,64,0.4)', background: 'none', cursor: 'pointer', color: '#B94040', borderRadius: 0, whiteSpace: 'nowrap' }}>
                                    Cancel
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Past */}
                        {past.length > 0 && (
                          <div>
                            <div style={{ padding: '12px 24px 4px' }}>
                              <span style={{ fontSize: 11, fontWeight: 500, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Past · {past.length}</span>
                            </div>
                            {past.slice().reverse().map(b => {
                              const room = rooms.find(r => r.id === b.room_id)
                              return (
                                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 24px 8px 58px', borderTop: `1px solid ${T.borderFaint}`, opacity: 0.5 }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, color: T.text }}>{room?.name ?? '—'}</div>
                                    <div style={{ fontSize: 12, color: T.textMuted }}>{fmtRow(b.start_time)} · {fmtT(b.start_time)}–{fmtT(b.end_time)}</div>
                                    {b.title && <div style={{ fontSize: 11, color: T.textFaint }}>{b.title}</div>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Edit booking modal */}
      {editBooking && (() => {
        const isOthers = mEmail && editBooking.booker_email !== mEmail
        const editInvalid = !editStart || !editEnd || editEnd <= editStart
        return (
          <div onClick={() => { setEditBooking(null); setEditConflicts([]) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: T.modalBg, borderRadius: 0, padding: 28, width: 370, border: `1px solid ${T.modalBorder}`, boxShadow: dark ? '0 24px 64px rgba(0,0,0,0.6)' : '0 12px 48px rgba(0,0,0,0.18)' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: dark ? T.text : NAVY, marginBottom: isOthers ? 10 : 20, letterSpacing: '-0.02em' }}>
                Edit booking <span style={{ color: ROSE }}>·</span> {selectedRoom?.name}
              </div>
              {isOthers && editConflicts.length === 0 && (
                <div style={{ background: '#C0392B', borderRadius: 0, padding: '12px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>⚠️ Not your booking</div>
                  <div style={{ fontSize: 12, color: '#fddede', lineHeight: 1.5 }}>
                    {visShowOrganizer
                      ? <>This belongs to <strong style={{ color: '#fff' }}>{editBooking.booker_name}</strong>. They will receive an email if you save changes.</>
                      : 'This booking belongs to someone else. They will receive an email if you save changes.'}
                  </div>
                </div>
              )}
              {!isOthers && editConflicts.length === 0 && (
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Title</label>
                  {visShowTitle && <div style={{ fontSize: 11, color: '#C0392B', fontWeight: 600, marginBottom: 6 }}>⚠ Everyone can see this</div>}
                  <input style={inp} placeholder="e.g. Team standup" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                </div>
              )}
              {(!isOthers || visShowOrganizer) && (
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>{isOthers ? 'Booked by' : 'Your name'}</label>
                  <NameAutocomplete value={editName} onChange={setEditName} onSelect={u => { setEditName(u.name); setEditEmail(u.email) }} workspace={workspace} style={inp} />
                </div>
              )}
              {(!isOthers || visShowOrganizer) && editConflicts.length === 0 && (
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Email</label>
                  <input style={inp} type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                </div>
              )}
              {editConflicts.length === 0 && <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Date</label>
                <input style={inp} type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>}
              {editConflicts.length === 0 && <div style={{ display: 'flex', gap: 8, marginBottom: editInvalid ? 8 : 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Start time</label>
                  <TimePicker value={editStart} onChange={setEditStart} dark={dark} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>End time</label>
                  <TimePicker value={editEnd} onChange={setEditEnd} dark={dark} />
                </div>
              </div>}
              {editConflicts.length > 0 && <>
                <div style={{ background: dark ? 'rgba(251,191,36,0.1)' : '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 4, padding: '10px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#92400E', marginBottom: 6 }}>
                    {editConflicts.length === 1 ? '1 meeting' : `${editConflicts.length} meetings`} couldn't be moved — time slot already taken
                  </div>
                  <div style={{ fontSize: 12, color: '#78350F', lineHeight: 1.7 }}>
                    {editConflicts.map(d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })).join(' · ')}
                  </div>
                </div>
                <button onClick={() => { setEditBooking(null); setEditConflicts([]) }}
                  style={{ width: '100%', background: SAGE, color: '#fff', border: 'none', borderRadius: 0, padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.02em' }}>
                  Got it
                </button>
              </>}
              {!editScopeStep && editConflicts.length === 0 && <>
                {editInvalid && <div style={{ fontSize: 12, color: '#B94040', marginBottom: 12 }}>End time must be after start time.</div>}
                {editError && <div style={{ fontSize: 12, color: '#B94040', marginBottom: 12 }}>{editError}</div>}
                <button onClick={handleEditSave} disabled={editSubmitting || editInvalid || !editName || !editEmail}
                  style={{ width: '100%', background: editSubmitting ? '#9ab5c8' : SAGE, color: '#fff', border: 'none', borderRadius: 0, padding: 13, fontSize: 14, fontWeight: 600, cursor: editSubmitting ? 'default' : 'pointer', marginBottom: 8, letterSpacing: '0.02em' }}>
                  {editSubmitting ? 'Saving…' : 'Save changes'}
                </button>
                <button onClick={handleEditCancel}
                  style={{ width: '100%', background: 'none', border: 'none', padding: '6px 0', fontSize: 12, color: '#B94040', cursor: 'pointer', textDecoration: 'underline' }}>
                  Cancel this booking
                </button>
              </>}
              {editScopeStep && <>
                <div style={{ fontSize: 14, fontWeight: 600, color: dark ? T.text : NAVY, marginBottom: 6 }}>Apply changes to…</div>
                <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 16 }}>This is a recurring meeting.</div>
                <button onClick={() => doEditSave('this')}
                  style={{ width: '100%', background: SAGE, color: '#fff', border: 'none', borderRadius: 0, padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8, letterSpacing: '0.02em' }}>
                  Just this meeting
                </button>
                <button onClick={() => doEditSave('future')}
                  style={{ width: '100%', background: 'transparent', border: `1px solid ${T.inputBorder}`, borderRadius: 0, padding: 13, fontSize: 14, cursor: 'pointer', color: T.text, marginBottom: 12, letterSpacing: '0.01em' }}>
                  This and all following
                </button>
                <button onClick={() => setEditScopeStep(false)}
                  style={{ width: '100%', background: 'none', border: 'none', padding: '6px 0', fontSize: 12, color: T.textMuted, cursor: 'pointer' }}>
                  ← Back to editing
                </button>
              </>}
            </div>
          </div>
        )
      })()}

      {myBkCancelConfirm && (
        <div onClick={() => setMyBkCancelConfirm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.cardBg, border: `1px solid ${T.border}`, padding: '28px 24px', width: 320 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 8 }}>
              Cancel {myBkSelected.size} booking{myBkSelected.size !== 1 ? 's' : ''}?
            </div>
            <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 24, lineHeight: 1.5 }}>
              For recurring bookings, only these specific occurrences will be cancelled.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setMyBkCancelConfirm(false)}
                style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 500, background: 'none', border: `1px solid ${T.border}`, color: T.text, cursor: 'pointer', fontFamily: 'inherit' }}>
                Keep them
              </button>
              <button onClick={confirmMyBkCancel}
                style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600, background: '#B94040', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                Yes, cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmCancel && (
        <div onClick={() => setConfirmCancel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.cardBg, border: `1px solid ${T.border}`, padding: '28px 24px', width: 320 }}>
            {confirmCancel.onConfirmScope ? <>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>Cancel recurring booking?</div>
              <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 20 }}>Which meetings should be cancelled?</div>
              <button onClick={() => confirmCancel.onConfirmScope!('this')} style={{ display: 'block', width: '100%', padding: '11px 0', fontSize: 13, fontWeight: 600, background: 'none', border: `1px solid ${T.border}`, color: T.text, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}>
                Just this meeting
              </button>
              <button onClick={() => confirmCancel.onConfirmScope!('future')} style={{ display: 'block', width: '100%', padding: '11px 0', fontSize: 13, fontWeight: 600, background: '#B94040', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12 }}>
                This and all following
              </button>
              <button onClick={() => setConfirmCancel(null)} style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: '4px 0', fontSize: 12, color: T.textMuted, cursor: 'pointer', fontFamily: 'inherit' }}>
                Go back
              </button>
            </> : <>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 8 }}>Cancel this booking?</div>
              <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 24 }}>{confirmCancel.message}</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setConfirmCancel(null)} style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 500, background: 'none', border: `1px solid ${T.border}`, color: T.text, cursor: 'pointer', fontFamily: 'inherit' }}>
                  No, go back
                </button>
                <button onClick={confirmCancel.onConfirm} style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600, background: '#B94040', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Yes, cancel it
                </button>
              </div>
            </>}
          </div>
        </div>
      )}

      {/* Feedback button */}
      <button onClick={() => { setShowFeedback(true); setFbDone(false) }}
        style={{ position: 'fixed', bottom: 16, right: 16, fontSize: 11, color: 'rgba(0,0,0,0.28)', background: 'none', border: '1px solid rgba(0,0,0,0.18)', padding: '5px 11px', cursor: 'pointer', zIndex: 50, fontFamily: 'inherit', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        feedback
      </button>

      {/* Feedback modal */}
      {showFeedback && (
        <div onClick={() => setShowFeedback(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.cardBg, border: `1px solid ${T.border}`, padding: '24px', width: 360 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6 }}>Send feedback</div>
            <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 16, lineHeight: 1.5 }}>Bug, request, or anything else — thanks for sharing!</div>
            {fbDone ? (
              <div style={{ fontSize: 14, color: SAGE, fontWeight: 500, padding: '12px 0' }}>Thanks! ✓</div>
            ) : (
              <>
                <textarea
                  autoFocus
                  value={fbMessage}
                  onChange={e => setFbMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={4}
                  style={{ width: '100%', padding: '9px 10px', fontSize: 13, border: `1px solid ${T.border}`, background: T.cardBg, color: T.text, outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 12 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowFeedback(false)}
                    style={{ flex: 1, padding: '9px 0', background: 'none', border: `1px solid ${T.border}`, color: T.textMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                  <button onClick={submitFeedback} disabled={fbSubmitting || !fbMessage.trim()}
                    style={{ flex: 1, padding: '9px 0', background: fbMessage.trim() ? NAVY : T.border, border: 'none', color: fbMessage.trim() ? '#fff' : T.textMuted, fontSize: 13, fontWeight: 500, cursor: fbMessage.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                    {fbSubmitting ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
