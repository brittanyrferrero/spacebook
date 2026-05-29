'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import type { Room, Booking } from '@/types'
import { NameAutocomplete } from '@/components/NameAutocomplete'

// ─── Colours ──────────────────────────────────────────────────────────────────
const SAGE = '#5C7A6B'
const NAVY = '#111111'
const ROSE = '#c45f80'          // user accent — selected day, now-line
const BOOK_GREEN = '#1db954'
const FREE_BG = '#c8ebd8'; const FREE_TEXT = '#1b5e30'; const FREE_BAR = '#2d7044'
const BUSY_BG = '#f0f0f0'; const BUSY_TEXT = '#1a1a1a'; const BUSY_BAR = '#333333'

// ─── Delight utilities ────────────────────────────────────────────────────────
function playTap() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(900, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.06)
    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07)
    osc.start(); osc.stop(ctx.currentTime + 0.09)
    osc.onended = () => ctx.close()
  } catch {}
}

function playConfirm() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    ;[[523.25, 0], [659.25, 0.1], [783.99, 0.2]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.value = freq
      const t = ctx.currentTime + delay
      gain.gain.setValueAtTime(0.001, t)
      gain.gain.linearRampToValueAtTime(0.13, t + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
      osc.start(t); osc.stop(t + 0.6)
    })
    setTimeout(() => ctx.close(), 1400)
  } catch {}
}

function hapticTap() { try { navigator.vibrate?.(8) } catch {} }
function hapticConfirm() { try { navigator.vibrate?.([60, 40, 100]) } catch {} }

// ─── Calendar constants ───────────────────────────────────────────────────────
const GRID_START = 8            // 8 am
const GRID_END   = 20           // 8 pm
const GRID_HOURS = GRID_END - GRID_START
const HOUR_H     = 38           // px per hour in week view
const GRID_H     = GRID_HOURS * HOUR_H

const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_LONG    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DAYS_SHORT   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']  // ISO Mon-first

// ─── Date helpers ─────────────────────────────────────────────────────────────
const dateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

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
function toGridPct(h: number, m: number, gs = GRID_START, gh = GRID_HOURS) {
  return ((h - gs) + m / 60) / gh
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
  const sel: React.CSSProperties = { fontSize: 14, padding: '8px 6px', border: '1px solid #cccccc', borderRadius: 0, outline: 'none', fontFamily: 'inherit', flex: 1, background: '#fff', cursor: 'pointer', ...style }
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

// ─── Sub-views ────────────────────────────────────────────────────────────────

function DayView({ bookings, viewDate, onSlotClick, onBookingClick, pendingSlot, now, gridStart = GRID_START, gridEnd = GRID_END, visShowTitle = false }: {
  bookings: Booking[];
  viewDate: Date;
  onSlotClick?: (date: Date, time: string) => void;
  onBookingClick?: (b: Booking) => void;
  pendingSlot?: { ds: string; startHHMM: string; endHHMM: string } | null;
  now?: Date; gridStart?: number; gridEnd?: number; visShowTitle?: boolean;
}) {
  const gridHours = gridEnd - gridStart
  const gridH = gridHours * HOUR_H
  const gp = (h: number, m: number) => toGridPct(h, m, gridStart, gridHours)
  const [chronoFlash, setChronoFlash] = useState(false)
  const ds = dateStr(viewDate)
  const todayDs = now ? dateStr(now) : dateStr(new Date())
  const isPast = ds < todayDs
  const activeBookings = bookings.filter(b => !b.cancelled_at)

  function flashChrono() {
    setChronoFlash(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setChronoFlash(true)))
    setTimeout(() => setChronoFlash(false), 1800)
  }
  const hourLabels = Array.from({ length: gridHours + 1 }, (_, i) => {
    const h = gridStart + i
    return h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
  })

  return (
    <div style={{ display: 'flex', overflow: 'visible' }}>
      {/* Hour axis */}
      <div style={{ flexShrink: 0, width: 38, position: 'relative', height: gridH }}>
        {hourLabels.map((label, i) => (
          <div key={label} style={{ position: 'absolute', top: Math.max(0, i * HOUR_H - 7), right: 4, fontSize: 10, color: '#374151', textAlign: 'right', whiteSpace: 'nowrap' }}>{label}</div>
        ))}
      </div>

      {/* Time grid */}
      <div style={{ flex: 1, borderLeft: '1px solid #dddddd' }}>
        <div
          style={{ position: 'relative', height: gridH, overflow: 'hidden', cursor: onSlotClick ? 'pointer' : 'default' }}
          onClick={onSlotClick ? (e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const y = e.clientY - rect.top
            const fracHours = (Math.max(0, Math.min(y, gridH)) / gridH) * gridHours
            const totalMins = Math.round((gridStart * 60 + fracHours * 60) / 15) * 15
            const h = Math.min(Math.floor(totalMins / 60), gridEnd - 1)
            const m = totalMins % 60
            if (isPast) { flashChrono(); return }
            if (now && dateStr(viewDate) === dateStr(now)) {
              const slotTime = new Date(viewDate); slotTime.setHours(h, m, 0, 0)
              if (slotTime < now) { flashChrono(); return }
            }
            onSlotClick(viewDate, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
          } : undefined}>
          {/* Hour bands + grid lines */}
          {Array.from({ length: gridHours }, (_, i) => (
            <div key={i} style={{ position: 'absolute', top: i * HOUR_H, left: 0, right: 0, height: HOUR_H, background: i % 2 === 0 ? 'rgba(0,0,0,0.018)' : 'transparent', borderTop: `1px solid ${isPast ? '#eeeeee' : '#cccccc'}` }} />
          ))}

          {/* Ghost pending block */}
          {pendingSlot?.ds === ds && (() => {
            const [sh, sm] = pendingSlot.startHHMM.split(':').map(Number)
            const [eh, em] = pendingSlot.endHHMM.split(':').map(Number)
            const topPx    = Math.max(0, gp(sh, sm) * gridH)
            const heightPx = Math.max(8, (gp(eh, em) - gp(sh, sm)) * gridH)
            return <div style={{ position: 'absolute', top: topPx, left: 2, right: 2, height: heightPx, background: 'rgba(148,163,184,0.25)', borderRadius: 4, border: '1.5px dashed #94A3B8', pointerEvents: 'none' }} />
          })()}

          {/* Chronology protection flash */}
          {chronoFlash && (
            <div style={{ position: 'absolute', top: '38%', left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', letterSpacing: '0.07em', animation: 'chronoFlash 1.8s ease-out forwards', whiteSpace: 'nowrap' }}>
                Chronology protection enforced.
              </span>
            </div>
          )}

          {/* Past-time overlay */}
          {now && (() => {
            const pastH = isPast ? gridH : (dateStr(viewDate) === dateStr(now) ? Math.max(0, gp(now.getHours(), now.getMinutes()) * gridH) : 0)
            return pastH > 0 ? <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: pastH, background: 'rgba(0,0,0,0.30)', pointerEvents: 'none', zIndex: 2 }} /> : null
          })()}

          {/* Current time line */}
          {now && dateStr(viewDate) === dateStr(now) && <NowLine now={now} gridH={gridH} gridStart={gridStart} gridHours={gridHours} />}

          {/* Booking blocks */}
          {activeBookings.map(b => {
            const bs = new Date(b.start_time), be = new Date(b.end_time)
            const topPx    = Math.max(0, gp(bs.getHours(), bs.getMinutes()) * gridH)
            const heightPx = Math.max(16, (gp(be.getHours(), be.getMinutes()) - gp(bs.getHours(), bs.getMinutes())) * gridH)
            const isPast   = now ? be < now : false
            const blockBg     = isPast ? '#c0c5cc' : '#c8d2e0'
            const blockBorder = isPast ? '#9099a8' : BUSY_BAR
            const blockText   = isPast ? '#9ca3af' : BUSY_BAR
            return (
              <div key={b.id}
                onClick={e => { e.stopPropagation(); onBookingClick?.(b) }}
                style={{ position: 'absolute', top: topPx, left: 4, right: 4, height: heightPx, background: blockBg, borderRadius: 4, cursor: onBookingClick ? 'pointer' : 'default', borderLeft: `3px solid ${blockBorder}`, overflow: 'hidden' }}>
                {heightPx > 18 && <div style={{ padding: '2px 5px', fontSize: 11, color: blockText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{visShowTitle ? (b.recurring_series_id ? `↻ ${b.title || 'Occupied'}` : (b.title || 'Occupied')) : 'Occupied'}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WeekView({ bookings, weekDays, onSlotClick, onBookingClick, pendingSlot, now, gridStart = GRID_START, gridEnd = GRID_END, visShowTitle = false }: { bookings: Booking[]; weekDays: Date[]; onSlotClick?: (date: Date, time: string) => void; onBookingClick?: (b: Booking) => void; pendingSlot?: { ds: string; startHHMM: string; endHHMM: string } | null; now?: Date; gridStart?: number; gridEnd?: number; visShowTitle?: boolean }) {
  const gridHours = gridEnd - gridStart
  const gridH = gridHours * HOUR_H
  const gp = (h: number, m: number) => toGridPct(h, m, gridStart, gridHours)
  const todayStr = dateStr(new Date())
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

  const hourLabels = Array.from({ length: gridHours + 1 }, (_, i) => {
    const h = gridStart + i
    return h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
  })

  return (
    <div>
      {/* Day headers — outside scroll container so they never overlap the grid */}
      <div style={{ display: 'flex', marginLeft: 38, borderLeft: '1px solid #dddddd' }}>
        {weekDays.map((day, colIdx) => {
          const ds = dateStr(day)
          const isToday = ds === todayStr
          return (
            <div key={ds} style={{ flex: 1, textAlign: 'center', padding: '6px 0 8px', borderRight: colIdx < 6 ? '1px solid #eeeeee' : 'none' }}>
              <div style={{ fontSize: 11, color: isToday ? ROSE : '#4B5563', fontWeight: isToday ? 600 : 500 }}>{DAYS_SHORT[colIdx]}</div>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: isToday ? ROSE : 'transparent', color: isToday ? '#fff' : '#374151', fontSize: 12, fontWeight: isToday ? 600 : 400, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px auto 0' }}>
                {day.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scrollable time grid */}
      <div style={{ display: 'flex', overflow: 'auto', maxHeight: gridH + 16 }}>
        {/* Hour axis */}
        <div style={{ flexShrink: 0, width: 38, position: 'relative', height: gridH }}>
          {hourLabels.map((label, i) => (
            <div key={label} style={{ position: 'absolute', top: Math.max(0, i * HOUR_H - 7), right: 4, fontSize: 10, color: '#374151', textAlign: 'right', whiteSpace: 'nowrap' }}>{label}</div>
          ))}
        </div>

        {/* Day columns */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, 1fr)`, flex: 1, borderLeft: '1px solid #dddddd' }}>
          {weekDays.map((day, colIdx) => {
            const ds = dateStr(day)
            const isToday = ds === todayStr
            const isPastDay = ds < todayStr
            const dayBookings = (byDay[ds] ?? []).filter(b => !b.cancelled_at)
            return (
              <div key={ds} style={{ borderRight: colIdx < 6 ? '1px solid #eeeeee' : 'none' }}>
                <div
                  style={{ position: 'relative', height: gridH, overflow: 'hidden', background: isPastDay ? 'rgba(0,0,0,0.03)' : isToday ? 'rgba(212,155,169,0.04)' : 'transparent', cursor: (onSlotClick && !isPastDay) ? 'pointer' : 'default' }}
                  onClick={onSlotClick && !isPastDay ? (e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const y = e.clientY - rect.top
                    const fracHours = (Math.max(0, Math.min(y, gridH)) / gridH) * gridHours
                    const totalMins = Math.round((gridStart * 60 + fracHours * 60) / 15) * 15
                    const h = Math.min(Math.floor(totalMins / 60), gridEnd - 1)
                    const m = totalMins % 60
                    if (isToday && now) { const s = new Date(day); s.setHours(h, m, 0, 0); if (s < now) { flashChrono(); return } }
                    onSlotClick(day, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
                  } : undefined}>
                  {/* Hour bands + grid lines */}
                  {Array.from({ length: gridHours }, (_, i) => (
                    <div key={i} style={{ position: 'absolute', top: i * HOUR_H, left: 0, right: 0, height: HOUR_H, background: i % 2 === 0 ? 'rgba(0,0,0,0.018)' : 'transparent', borderTop: '1px solid #eeeeee' }} />
                  ))}

                  {/* Pending booking ghost */}
                  {pendingSlot?.ds === ds && (() => {
                    const [sh, sm] = pendingSlot.startHHMM.split(':').map(Number)
                    const [eh, em] = pendingSlot.endHHMM.split(':').map(Number)
                    const topPx    = Math.max(0, gp(sh, sm) * gridH)
                    const heightPx = Math.max(8, (gp(eh, em) - gp(sh, sm)) * gridH)
                    return <div style={{ position: 'absolute', top: topPx, left: 2, right: 2, height: heightPx, background: 'rgba(148,163,184,0.25)', borderRadius: 4, border: '1.5px dashed #94A3B8', pointerEvents: 'none' }} />
                  })()}

                  {/* Past-time overlay */}
                  {now && (isPastDay || isToday) && (() => {
                    const pastH = isPastDay ? gridH : Math.max(0, gp(now.getHours(), now.getMinutes()) * gridH)
                    return pastH > 0 ? <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: pastH, background: 'rgba(0,0,0,0.30)', pointerEvents: 'none', zIndex: 2 }} /> : null
                  })()}
                  {chronoFlash && isToday && (
                    <div style={{ position: 'absolute', top: '35%', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 9, fontWeight: 600, color: '#6B7280', letterSpacing: '0.04em', animation: 'chronoFlash 1.8s ease-out forwards' }}>Chronology protection enforced.</span>
                    </div>
                  )}

                  {/* Current time line */}
                  {now && isToday && <NowLine now={now} gridH={gridH} gridStart={gridStart} gridHours={gridHours} />}

                  {/* Booking blocks */}
                  {dayBookings.map(b => {
                    const bs = new Date(b.start_time), be = new Date(b.end_time)
                    const topPx    = Math.max(0, gp(bs.getHours(), bs.getMinutes()) * gridH)
                    const heightPx = Math.max(16, (gp(be.getHours(), be.getMinutes()) - gp(bs.getHours(), bs.getMinutes())) * gridH)
                    const isPast   = now ? be < now : false
                    const blockBg     = isPast ? '#c0c5cc' : '#c8d2e0'
                    const blockBorder = isPast ? '#9099a8' : BUSY_BAR
                    const blockText   = isPast ? '#9ca3af' : BUSY_BAR
                    return (
                      <div key={b.id}
                        onClick={e => { e.stopPropagation(); onBookingClick?.(b) }}
                        style={{ position: 'absolute', top: topPx, left: 2, right: 2, height: heightPx, background: blockBg, borderRadius: 4, cursor: onBookingClick ? 'pointer' : 'default', borderLeft: `3px solid ${blockBorder}`, overflow: 'hidden' }}>
                        {heightPx > 18 && <div style={{ padding: '2px 4px', fontSize: 9, color: blockText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{visShowTitle ? (b.recurring_series_id ? `↻ ${b.title || 'Occupied'}` : (b.title || 'Occupied')) : 'Occupied'}</div>}
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
    const d = dateStr(new Date(b.start_time))
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
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderTop: '1px solid #eeeeee' }}>
          {week.map((day, di) => {
            const ds = dateStr(day)
            const inMonth  = day.getMonth() === viewMonth
            const isToday  = ds === todayStr
            const isPast   = ds < todayStr
            const count    = byDay[ds] ?? 0

            return (
              <div key={ds} onClick={() => { if (!isPast) onDayClick(day) }}
                style={{ padding: '6px 4px 8px', minHeight: 52, cursor: isPast ? 'default' : 'pointer', borderRight: di < 6 ? '1px solid #eeeeee' : 'none', background: isPast ? 'rgba(0,0,0,0.03)' : isToday ? 'rgba(212,155,169,0.07)' : 'transparent', transition: 'background .1s' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday ? ROSE : 'transparent', color: isToday ? '#fff' : isPast ? '#C8CDD4' : inMonth ? '#374151' : '#C8CDD4', fontSize: 11, fontWeight: isToday ? 600 : 400 }}>
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

function RoomDisplayPageInner() {
  const { workspace, roomId } = useParams<{ workspace: string; roomId: string }>()
  const api = `/api/${workspace}`
  const [room,         setRoom]         = useState<Room | null>(null)
  const [allRooms,     setAllRooms]     = useState<Room[]>([])
  const [todayBkgs,   setTodayBkgs]    = useState<Booking[]>([])   // this room, today
  const [allTodayBkgs, setAllTodayBkgs] = useState<Booking[]>([])  // all rooms, today
  const [rangeBkgs,   setRangeBkgs]    = useState<Booking[]>([])   // current view range
  const [now,          setNow]          = useState(new Date())
  const [calView,      setCalView]      = useState<CalView>('day')
  const [viewDate,     setViewDate]     = useState(new Date())
  const [gridStart,    setGridStart]    = useState(8)
  const [gridEnd,      setGridEnd]      = useState(20)
  const [visShowTitle, setVisShowTitle] = useState(false)
  const [busyFlash,    setBusyFlash]    = useState(false)
  const calContainerRef = useRef<HTMLDivElement>(null)

  // Modal state
  const [showModal,  setShowModal]  = useState<'now' | 'later' | null>(null)
  const [mName,      setMName]      = useState('')
  const [mEmail,     setMEmail]     = useState('')
  const [mTitle,     setMTitle]     = useState('')
  const [mDate,      setMDate]      = useState(() => dateStr(new Date()))
  const [mTime,      setMTime]      = useState('')
  const [mEndTime,   setMEndTime]   = useState('')
  const [mSubmitting,setMSubmitting]= useState(false)
  const [mDone,      setMDone]      = useState(false)
  const [walkInError,setWalkInError]= useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<{ onConfirm: () => void } | null>(null)
  const [celebrating, setCelebrating] = useState<{ name: string; roomName: string } | null>(null)
  const [recurFreq,  setRecurFreq]  = useState<'none' | 'weekly' | 'monthly'>('none')
  const [recurUntil, setRecurUntil] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 3); return dateStr(d) })

  // Edit existing booking
  const [editBooking,    setEditBooking]    = useState<Booking | null>(null)
  const [editTitle,      setEditTitle]      = useState('')
  const [editName,       setEditName]       = useState('')
  const [editEmail,      setEditEmail]      = useState('')
  const [editDate,       setEditDate]       = useState('')
  const [editStart,      setEditStart]      = useState('')
  const [editEnd,        setEditEnd]        = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError,      setEditError]      = useState<string | null>(null)

  const todayStr    = dateStr(now)
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
    fetch(`${api}/rooms`).then(r => r.json()).then((rooms: Room[]) => {
      setAllRooms(rooms)
      setRoom(rooms.find(r => r.id === roomId) ?? rooms[0] ?? null)
    })
  }, [roomId])

  const fetchToday = useCallback(() => {
    fetch(`${api}/bookings?room_id=${roomId}&date=${todayStr}`)
      .then(r => r.json()).then(setTodayBkgs)
    fetch(`${api}/bookings?date=${todayStr}`)
      .then(r => r.json()).then(setAllTodayBkgs)
  }, [roomId, todayStr])

  const fetchRange = useCallback(() => {
    const { from, to } = getRange()
    fetch(`${api}/bookings?room_id=${roomId}&from=${from}&to=${to}`)
      .then(r => r.json()).then(setRangeBkgs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, calView, viewDateStr])

  useEffect(() => { fetchRoom(); fetchToday() }, [fetchRoom, fetchToday])
  useEffect(() => { fetchRange() }, [fetchRange])
  useEffect(() => {
    fetch(`${api}/settings`).then(r => r.json()).then(d => {
      setGridStart(d.displayHours?.start ?? 8)
      setGridEnd(d.displayHours?.end ?? 20)
      setVisShowTitle(d.bookingVisibility?.showTitle ?? false)
    }).catch(() => {})
  }, [])

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

  // Pre-fill name/email from last booking — only within a 2-minute window
  useEffect(() => {
    try {
      const saved = localStorage.getItem('spacebook_user')
      if (saved) {
        const { name, email, savedAt } = JSON.parse(saved)
        if (savedAt && Date.now() - savedAt < 2 * 60 * 1000) {
          setMName(name); setMEmail(email)
        } else {
          localStorage.removeItem('spacebook_user')
        }
      }
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

  // Global tap sound + haptic for all buttons
  useEffect(() => {
    function onPress(e: PointerEvent) {
      if ((e.target as HTMLElement).closest('button')) { playTap(); hapticTap() }
    }
    window.addEventListener('pointerdown', onPress, { passive: true })
    return () => window.removeEventListener('pointerdown', onPress)
  }, [])

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

  const availableRooms = allRooms.filter(r => {
    if (r.id === roomId) return false
    const { status } = getRoomStatus(allTodayBkgs.filter(b => b.room_id === r.id))
    return status === 'free'
  })

  function durationConflicts(mins: number): boolean {
    const start = now
    const end = new Date(start.getTime() + mins * 60 * 1000)
    return todayBkgs.some(b => {
      if (b.cancelled_at) return false
      return new Date(b.start_time) < end && new Date(b.end_time) > start
    })
  }

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
    setMTitle('Occupied')
    setRecurFreq('none')
    setMDone(false)
    setShowModal('later')
  }

  function openEdit(b: Booking) {
    const bs = new Date(b.start_time), be = new Date(b.end_time)
    console.log('[openEdit] raw start_time=%s end_time=%s → local start=%d:%d end=%d:%d', b.start_time, b.end_time, bs.getHours(), bs.getMinutes(), be.getHours(), be.getMinutes())
    setEditBooking(b)
    setEditTitle(b.title ?? '')
    setEditName(b.booker_name)
    setEditEmail(b.booker_email)
    setEditDate(dateStr(new Date(b.start_time)))
    setEditStart(`${String(bs.getHours()).padStart(2, '0')}:${String(bs.getMinutes()).padStart(2, '0')}`)
    setEditEnd(`${String(be.getHours()).padStart(2, '0')}:${String(be.getMinutes()).padStart(2, '0')}`)
    setEditError(null)
  }

  async function handleEditSave() {
    if (!editBooking) return
    setEditSubmitting(true)
    setEditError(null)
    const [sh, sm] = editStart.split(':').map(Number)
    const [eh, em] = editEnd.split(':').map(Number)
    const [y, mo, d] = editDate.split('-').map(Number)
    const startIso = new Date(y, mo - 1, d, sh, sm, 0, 0).toISOString()
    const endIso   = new Date(y, mo - 1, d, eh, em, 0, 0).toISOString()
    console.log('[edit] date=%s start=%s end=%s → startIso=%s endIso=%s', editDate, editStart, editEnd, startIso, endIso)
    const res = await fetch(`${api}/bookings/${editBooking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booker_name: editName,
        booker_email: editEmail,
        start_time: startIso,
        end_time: endIso,
        _editor_name: mName,
        _editor_email: mEmail,
        _room_name: room?.name ?? '',
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setEditError(err.error ?? 'Save failed. Please try again.')
      setEditSubmitting(false)
      return
    }
    const updated: Booking = await res.json()
    const updater = (prev: Booking[]) => prev.map(b => b.id === editBooking.id ? updated : b)
    setRangeBkgs(updater)
    setTodayBkgs(updater)
    setAllTodayBkgs(updater)
    setEditBooking(null)
    setEditSubmitting(false)
    fetchRange()
    fetchToday()
  }

  async function handleEditCancel() {
    if (!editBooking) return
    setConfirmCancel({ onConfirm: async () => {
      setConfirmCancel(null)
      const cancelledAt = new Date().toISOString()
      const id = editBooking.id
      const markCancelled = (prev: Booking[]) =>
        prev.map(b => b.id === id ? { ...b, cancelled_at: cancelledAt } : b)
      setRangeBkgs(markCancelled)
      setTodayBkgs(markCancelled)
      setAllTodayBkgs(markCancelled)
      setEditBooking(null)
      await fetch(`/api/cancel/${editBooking.cancel_token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'this' }) })
      fetchRange()
      fetchToday()
    }})
  }

  const pendingSlot = showModal === 'later' && mDate && mTime && mEndTime
    ? { ds: mDate, startHHMM: mTime, endHHMM: mEndTime }
    : null

  // Day filter for the day view (filter rangeBkgs to viewDate)
  const dayBookings = rangeBkgs.filter(b => dateStr(new Date(b.start_time)) === viewDateStr)

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
    const res = await fetch(`${api}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: room.id, booker_name: mName, booker_email: mEmail, start_time: startTime, end_time: endTime, title: mTitle || null, origin: 'tablet', ...(recurrence ? { recurrence } : {}) }),
    })
    if (res.ok) {
      try { localStorage.setItem('spacebook_user', JSON.stringify({ name: mName, email: mEmail, savedAt: Date.now() })) } catch {}
      const data = await res.json()
      const newBkg: Booking | undefined = data.booking ?? (data.id ? data : undefined)
      if (newBkg?.id) {
        setRangeBkgs(prev => [...prev, newBkg])
        setTodayBkgs(prev => [...prev, newBkg])
        setAllTodayBkgs(prev => [...prev, newBkg])
      }
      setMTitle(''); setRecurFreq('none')
      setShowModal(null)
      setCelebrating({ name: mName, roomName: room?.name ?? '' })
      playConfirm(); hapticConfirm()
      setTimeout(() => setCelebrating(null), 2800)
      fetchToday(); fetchRange()
    }
    setMSubmitting(false)
  }

  async function handleWalkIn(minutes: number) {
    if (!room) return
    setMSubmitting(true)
    const start = new Date()
    const end = new Date(start.getTime() + minutes * 60 * 1000)
    const res = await fetch(`${api}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: room.id, booker_name: 'Walk-in', booker_email: 'walkin@local', start_time: start.toISOString(), end_time: end.toISOString(), title: 'Occupied', origin: 'tablet' }),
    })
    if (res.ok) {
      setWalkInError(null)
      const data = await res.json()
      const newBkg: Booking | undefined = data.booking ?? data
      if (newBkg?.id) {
        setRangeBkgs(prev => [...prev, newBkg])
        setTodayBkgs(prev => [...prev, newBkg])
        setAllTodayBkgs(prev => [...prev, newBkg])
      }
      setShowModal(null)
      setCelebrating({ name: '', roomName: room?.name ?? '' })
      playConfirm(); hapticConfirm()
      setTimeout(() => setCelebrating(null), 2800)
      fetchToday(); fetchRange()
      const h = start.getHours(), m = start.getMinutes()
      const scrollTo = Math.max(0, toGridPct(h, m, gridStart, gridEnd - gridStart) * ((gridEnd - gridStart) * HOUR_H) - 80)
      setTimeout(() => calContainerRef.current?.scrollTo({ top: scrollTo, behavior: 'smooth' }), 50)
    } else {
      const body = await res.json().catch(() => ({}))
      const msg = body.error ?? 'Something went wrong. Please try again.'
      setWalkInError(msg)
      setShowModal('now')
    }
    setMSubmitting(false)
  }

  const inp: React.CSSProperties = { fontSize: 14, padding: '8px 10px', border: '1px solid #cccccc', borderRadius: 0, outline: 'none', fontFamily: 'inherit', width: '100%' }
  const lbl: React.CSSProperties = { fontSize: 12, color: '#6B7280', fontWeight: 500, display: 'block', marginBottom: 4 }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', fontFamily: "'Nunito', system-ui, sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;1,400&family=Nunito:wght@400;500;600;700;800&display=swap');@keyframes shimmer{0%,55%{background-position:-250% center}80%,100%{background-position:250% center}}@keyframes chronoFlash{0%{opacity:0;transform:translateY(3px)}12%{opacity:1;transform:translateY(0)}70%{opacity:1}100%{opacity:0}}@keyframes checkDraw{from{stroke-dashoffset:50}to{stroke-dashoffset:0}}@keyframes celebIn{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:scale(1)}}button:not(:disabled):active{transform:scale(0.95)}` }} />

      {/* Clock bar */}
      <div style={{ background: '#111111', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 22, fontWeight: 500, color: '#fff' }}>
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)' }}>
          {DAYS_LONG[now.getDay()]}, {now.getDate()} {MONTHS_LONG[now.getMonth()]} {now.getFullYear()}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['day', 'week', 'month'] as CalView[]).map(v => (
            <button key={v} onClick={() => { setCalView(v); setViewDate(new Date()) }}
              style={{ fontSize: 12, padding: '4px 12px', borderRadius: 0, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: calView === v ? 600 : 400, background: calView === v ? '#ffffff' : 'rgba(255,255,255,0.15)', color: calView === v ? '#111111' : '#fff', transition: 'background .15s' }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {calView === 'day' ? (
        /* ── Portrait day view ── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

          {/* Status band */}
          <div style={{ background: bandBg, padding: '28px 28px 22px', flexShrink: 0, transition: 'background .4s' }}>
            <div style={{ fontSize: 88, fontWeight: 700, color: bigColor, lineHeight: 0.9, letterSpacing: '-0.03em', marginBottom: 12 }}>
              {isFree ? 'Available' : 'In use'}
            </div>
            <div style={{ fontSize: 17, color: isFree ? FREE_BAR : 'rgba(255,255,255,0.92)', marginBottom: 10 }}>
              {isFree ? `Free until ${until}` : `Free from ${until}`}
            </div>
            <div style={{ fontSize: 13, color: isFree ? FREE_TEXT : 'rgba(255,255,255,0.7)' }}>
              {[room?.name, room?.capacity ? `${room.capacity} people` : null, room?.amenities?.join(', ')].filter(Boolean).join(' · ')}
            </div>
          </div>

          {/* Action section */}
          <div style={{ flexShrink: 0, borderTop: '1px solid #cccccc', borderBottom: '1px solid #cccccc', padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'stretch' }}>

            {/* Left: Book now + time picks (when free) or available rooms (when busy) */}
            <div style={{ flex: 1 }}>
              {isFree ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={() => { setShowModal('now'); setMDone(false) }}
                    style={{ width: '100%', background: `linear-gradient(90deg,${ROSE} 0%,${ROSE} 30%,#d9789c 45%,#f0c0d4 50%,#d9789c 55%,${ROSE} 70%,${ROSE} 100%)`, backgroundSize: '300% 100%', color: '#fff', border: 'none', borderRadius: 0, padding: '10px 0', fontSize: 18, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', animation: 'shimmer 4.5s ease-in-out infinite', letterSpacing: '0.04em' }}>
                    BOOK NOW
                  </button>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[15, 30, 60, 120, 180].map(mins => {
                      const blocked = durationConflicts(mins)
                      return (
                        <button key={mins}
                          onClick={() => { if (!blocked) { setMDone(false); handleWalkIn(mins) } }}
                          disabled={mSubmitting || blocked}
                          style={{ flex: 1, background: blocked ? 'transparent' : ROSE, color: blocked ? '#C8CDD4' : '#fff', border: blocked ? '1px solid #e5e7eb' : 'none', borderRadius: 0, padding: '10px 0', fontSize: 13, fontWeight: 500, cursor: (mSubmitting || blocked) ? 'default' : 'pointer', fontFamily: 'inherit', opacity: mSubmitting ? 0.6 : 1, textDecoration: blocked ? 'line-through' : 'none' }}>
                          {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#4B5563', letterSpacing: '0.07em', textTransform: 'uppercase' as const, marginBottom: 8 }}>
                    Available rooms
                  </div>
                  {availableRooms.length === 0 ? (
                    <div style={{ fontSize: 14, color: '#4B5563' }}>No other rooms free right now</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {availableRooms.slice(0, 4).map(r => {
                        const { until: roomUntil } = getRoomStatus(allTodayBkgs.filter(b => b.room_id === r.id))
                        return (
                          <a key={r.id} href={`/room/${r.id}`}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: FREE_BG, textDecoration: 'none', borderLeft: `3px solid ${FREE_BAR}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: FREE_TEXT }}>{r.name}</div>
                              {r.room_type && <div style={{ fontSize: 11, color: '#374151' }}>{r.room_type}</div>}
                            </div>
                            <div style={{ fontSize: 12, color: FREE_BAR, whiteSpace: 'nowrap' }}>free until {roomUntil}</div>
                          </a>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ width: 1, background: '#cccccc', flexShrink: 0 }} />

            {/* Right: Schedule for later */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => { setMDate(todayStr); setMTime(''); setMEndTime(''); setMTitle('Occupied'); setRecurFreq('none'); setShowModal('later'); setMDone(false) }}
                style={{ background: '#fff', border: '1px solid #cccccc', borderRadius: 0, padding: '12px 16px', fontSize: 14, cursor: 'pointer', color: '#111111', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                Schedule for later
              </button>
            </div>
          </div>

          {/* Nav + Calendar */}
          <div ref={calContainerRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
              <button onClick={() => shiftView(-1)} style={{ background: 'none', border: '1px solid #cccccc', borderRadius: 0, padding: '3px 9px', cursor: 'pointer', fontSize: 14, color: '#374151', lineHeight: 1 }}>‹</button>
              {(() => {
                const isCurrent = viewDateStr === todayStr
                return <span style={{ fontSize: 13, fontWeight: 500, minWidth: 160, textAlign: 'center', color: isCurrent ? ROSE : NAVY, background: isCurrent ? 'rgba(212,155,169,0.12)' : 'transparent', borderRadius: 0, padding: '2px 10px' }}>{navLabel()}</span>
              })()}
              <button onClick={() => shiftView(1)} style={{ background: 'none', border: '1px solid #cccccc', borderRadius: 0, padding: '3px 9px', cursor: 'pointer', fontSize: 14, color: '#374151', lineHeight: 1 }}>›</button>
            </div>
            <DayView bookings={dayBookings} viewDate={viewDate} onSlotClick={openScheduleLater} onBookingClick={openEdit} pendingSlot={pendingSlot} now={now} gridStart={gridStart} gridEnd={gridEnd} visShowTitle={visShowTitle} />
          </div>
        </div>
      ) : (
        /* ── Week / Month ── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <div style={{ overflowY: 'auto', background: '#fff', padding: '40px 24px 16px', borderBottom: '1px solid #cccccc' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
              <button onClick={() => shiftView(-1)} style={{ background: 'none', border: '1px solid #cccccc', borderRadius: 0, padding: '3px 9px', cursor: 'pointer', fontSize: 14, color: '#374151', lineHeight: 1 }}>‹</button>
              {(() => {
                const isCurrent =
                  (calView === 'week'  && todayStr >= dateStr(weekDays[0]) && todayStr <= dateStr(weekDays[6])) ||
                  (calView === 'month' && viewDate.getFullYear() === now.getFullYear() && viewDate.getMonth() === now.getMonth())
                return <span style={{ fontSize: 13, fontWeight: 500, minWidth: 160, textAlign: 'center', color: isCurrent ? ROSE : NAVY, background: isCurrent ? 'rgba(212,155,169,0.12)' : 'transparent', borderRadius: 0, padding: '2px 10px' }}>{navLabel()}</span>
              })()}
              <button onClick={() => shiftView(1)} style={{ background: 'none', border: '1px solid #cccccc', borderRadius: 0, padding: '3px 9px', cursor: 'pointer', fontSize: 14, color: '#374151', lineHeight: 1 }}>›</button>
            </div>
            {calView === 'week'  && <WeekView  bookings={rangeBkgs} weekDays={weekDays} onSlotClick={openScheduleLater} onBookingClick={openEdit} pendingSlot={pendingSlot} now={now} gridStart={gridStart} gridEnd={gridEnd} visShowTitle={visShowTitle} />}
            {calView === 'month' && <MonthView bookings={rangeBkgs} viewDate={viewDate} onDayClick={d => { setViewDate(d); setCalView('day') }} />}
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 20px' }}>
          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <button
                onClick={() => {
                  if (!isFree) { setBusyFlash(true); setTimeout(() => setBusyFlash(false), 2200); return }
                  const t = toHHMMExact(new Date()); const [h,m] = t.split(':').map(Number); const et = Math.min(h*60+m+60,23*60); setMDate(todayStr); setMTime(t); setMEndTime(`${String(Math.floor(et/60)).padStart(2,'0')}:${String(et%60).padStart(2,'0')}`); setShowModal('now'); setMDone(false)
                }}
                style={{ background: isFree ? `linear-gradient(90deg,${ROSE} 0%,${ROSE} 30%,#d9789c 45%,#f0c0d4 50%,#d9789c 55%,${ROSE} 70%,${ROSE} 100%)` : 'transparent', backgroundSize: isFree ? '300% 100%' : undefined, color: isFree ? '#fff' : '#9CA3AF', border: isFree ? 'none' : '1px solid #e5e7eb', borderRadius: 0, padding: '15px', fontSize: 15, fontWeight: 800, cursor: 'pointer', width: '100%', textDecoration: isFree ? 'none' : 'line-through', animation: isFree ? 'shimmer 4.5s ease-in-out infinite' : 'none', letterSpacing: '0.04em' }}>
                BOOK NOW
              </button>
              {busyFlash && (
                <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, background: '#111', color: '#fff', fontSize: 12, padding: '7px 12px', textAlign: 'center', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                  In use — free from {until}
                </div>
              )}
            </div>
            <button onClick={() => { setMDate(todayStr); setMTime(''); setMEndTime(''); setMTitle('Occupied'); setShowModal('later'); setMDone(false) }}
              style={{ flex: 1, background: '#fff', border: '1px solid #cccccc', borderRadius: 0, padding: '15px', fontSize: 14, cursor: 'pointer', color: '#111111' }}>
              Schedule for later
            </button>
          </div>
          </div>
        </div>
      )}

      {/* Quick-book modal */}
      {showModal && (
        <div onClick={() => { setShowModal(null); setWalkInError(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 0, padding: 28, width: 340, border: '1px solid #cccccc' }}>
            {mDone ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: NAVY, marginBottom: 8 }}>Booking confirmed!</div>
                <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>Your room is reserved.</div>
                <button onClick={() => { setShowModal(null); setMDone(false); setMSubmitting(false) }}
                  style={{ background: ROSE, color: '#fff', border: 'none', borderRadius: 0, padding: '10px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Done</button>
              </div>
            ) : showModal === 'now' ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: NAVY }}>How long do you need?</div>
                <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>{room?.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[15, 30, 45, 60, 90, 120, 180].map(mins => (
                    <button key={mins} onClick={() => handleWalkIn(mins)} disabled={mSubmitting}
                      style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 500, background: '#fff', border: '1px solid #cccccc', borderRadius: 0, cursor: mSubmitting ? 'default' : 'pointer', color: NAVY, fontFamily: 'inherit', opacity: mSubmitting ? 0.6 : 1 }}>
                      {mins < 60 ? `${mins} min` : mins === 60 ? '1 hour' : mins % 60 === 0 ? `${mins / 60} hours` : `${Math.floor(mins / 60)}h ${mins % 60}m`}
                    </button>
                  ))}
                </div>
                {walkInError && (
                  <div style={{ marginTop: 12, fontSize: 13, color: '#b91c1c', textAlign: 'center' }}>{walkInError}</div>
                )}
                <button onClick={() => { setShowModal(null); setWalkInError(null) }} style={{ width: '100%', marginTop: 14, background: 'none', border: 'none', fontSize: 13, color: '#9CA3AF', cursor: 'pointer', padding: '6px 0' }}>Cancel</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 16, color: NAVY }}>
                  Schedule for later — {room?.name}
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
                          style={{ flex: 1, padding: '6px 0', fontSize: 12, borderRadius: 0, border: `1px solid ${recurFreq === f ? ROSE : '#cccccc'}`, cursor: 'pointer', fontFamily: 'inherit', background: recurFreq === f ? ROSE : 'transparent', color: recurFreq === f ? '#fff' : '#374151', fontWeight: recurFreq === f ? 600 : 400, transition: 'all .15s' }}>
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
                    style={{ flex: 1, background: 'none', border: '1px solid #cccccc', borderRadius: 0, padding: 10, fontSize: 14, cursor: 'pointer', color: '#6B7280' }}>
                    Cancel
                  </button>
                  <button onClick={handleQuickBook} disabled={mSubmitting || !mTime || !mEndTime || mEndTime <= mTime || (showModal === 'later' && recurFreq !== 'none' && !recurUntil)}
                    style={{ flex: 1, background: mSubmitting ? '#e8bdc7' : ROSE, color: '#fff', border: 'none', borderRadius: 0, padding: 10, fontSize: 14, fontWeight: 600, cursor: (mSubmitting || mEndTime <= mTime) ? 'default' : 'pointer' }}>
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
          <div onClick={() => setEditBooking(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 0, padding: 28, width: 340, border: '1px solid #cccccc', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: NAVY, marginBottom: isOthers ? 10 : 16 }}>
                Edit booking — {room?.name}
              </div>
              {isOthers && (
                <div style={{ background: '#C0392B', borderRadius: 0, padding: '12px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>⚠️ Not your booking</div>
                  <div style={{ fontSize: 12, color: '#fddede', lineHeight: 1.5 }}>
                    This belongs to <strong style={{ color: '#fff' }}>{editBooking.booker_name}</strong>. They will receive an email if you save changes.
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Your name</label>
                <NameAutocomplete value={editName} onChange={setEditName} onSelect={u => { setEditName(u.name); setEditEmail(u.email) }} workspace={workspace} style={inp} />
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
              {editError && <div style={{ fontSize: 12, color: '#B94040', marginBottom: 12 }}>{editError}</div>}
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button onClick={() => setEditBooking(null)}
                  style={{ flex: 1, background: 'none', border: '1px solid #cccccc', borderRadius: 0, padding: 10, fontSize: 13, cursor: 'pointer', color: '#6B7280' }}>
                  Close
                </button>
                <button onClick={handleEditSave} disabled={editSubmitting || editInvalid || !editName || !editEmail}
                  style={{ flex: 1, background: editSubmitting ? '#9ab5c8' : SAGE, color: '#fff', border: 'none', borderRadius: 0, padding: 10, fontSize: 13, fontWeight: 600, cursor: editSubmitting ? 'default' : 'pointer' }}>
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

      {celebrating && (
        <div onClick={() => setCelebrating(null)} style={{ position: 'fixed', inset: 0, background: '#1b5e30', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 300, animation: 'celebIn 0.3s ease-out', fontFamily: "'Nunito', system-ui, sans-serif" }}>
          <svg viewBox="0 0 52 52" width={96} height={96} style={{ marginBottom: 28 }}>
            <circle cx="26" cy="26" r="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
            <path fill="none" stroke="#7dd39c" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
              d="M12 26 L22 36 L40 18"
              strokeDasharray={50} strokeDashoffset={50}
              style={{ animation: 'checkDraw 0.4s ease-out 0.25s forwards' }} />
          </svg>
          <div style={{ fontSize: 64, fontWeight: 800, color: '#ffffff', lineHeight: 1, marginBottom: 14, letterSpacing: '-0.02em' }}>
            You're in!
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 10 }}>
            {celebrating.roomName}
          </div>
          <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
            {celebrating.name && celebrating.name !== 'Walk-in'
              ? `See you in there, ${celebrating.name.split(' ')[0]}!`
              : "Room's all yours."}
          </div>
          <button onClick={() => setCelebrating(null)}
            style={{ marginTop: 48, background: 'none', border: '1.5px solid rgba(255,255,255,0.35)', color: 'rgba(255,255,255,0.7)', padding: '10px 32px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em' }}>
            Done
          </button>
        </div>
      )}

      {confirmCancel && (
        <div onClick={() => setConfirmCancel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid #cccccc', padding: '28px 24px', width: 320 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: NAVY, marginBottom: 8 }}>Cancel this booking?</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 24 }}>This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmCancel(null)} style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 500, background: 'none', border: '1px solid #cccccc', color: NAVY, cursor: 'pointer', fontFamily: 'inherit' }}>
                No, go back
              </button>
              <button onClick={confirmCancel.onConfirm} style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600, background: '#B94040', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                Yes, cancel it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function RoomDisplayPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return <RoomDisplayPageInner />
}
