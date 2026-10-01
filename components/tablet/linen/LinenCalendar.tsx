'use client'

import type React from 'react'
import type { Booking } from '@/types'
import { addDays, blockLabel, dateStr, decHours, DAYS_SHORT, DAYS_LONG, MONTHS, fmtClock, fmtHour, isActive, monthGrid, pad, startOfDay } from './time'

interface GridProps {
  now: Date
  gridStart: number        // first hour shown (workspace display hours)
  gridEnd: number          // last hour shown
  calH: number             // pixel height available for the calendar body
  scale: number            // the stage's CSS scale, to turn taps into grid positions
  showTitle: boolean
  onSlot: (day: Date, time: string) => void
  onPast: () => void
  onBooking: (b: Booking) => void
}

const TOP = 8   // px of breathing room above the first hour line

function blockColors(b: Booking, now: Date) {
  if (b.is_block) return { bg: '#e4ddd1', fg: '#5e554d' }
  const s = new Date(b.start_time), e = new Date(b.end_time)
  if (e <= now) return { bg: '#e2d8c8', fg: '#5e554d' }           // past
  if (s <= now) return { bg: '#a4553a', fg: '#fbf8f2' }           // in progress
  return { bg: '#2a2522', fg: '#fbf8f2' }                          // upcoming
}

/** Where a booking sits on one day's grid, in hours, clamped to the visible window. */
function span(b: Booking, day: Date, gs: number, ge: number): [number, number] | null {
  const dayStart = startOfDay(day), dayEnd = addDays(dayStart, 1)
  const s = new Date(b.start_time), e = new Date(b.end_time)
  if (e <= dayStart || s >= dayEnd) return null
  const sh = s < dayStart ? 0 : decHours(s)
  const eh = e >= dayEnd ? 24 : decHours(e)
  const a = Math.max(sh, gs), z = Math.min(eh, ge)
  return z > a ? [a, z] : null
}

/** Turn a tap on a day column into a start time, applying the same past-time rules as Classic. */
function tapToSlot(e: React.MouseEvent<HTMLElement>, day: Date, H: number, p: GridProps) {
  const rect = e.currentTarget.getBoundingClientRect()
  const y = (e.clientY - rect.top) / p.scale
  let q = Math.floor((p.gridStart + (y - TOP) / H) * 4) / 4
  q = Math.max(p.gridStart, Math.min(q, p.gridEnd - 0.25))
  const today = startOfDay(p.now)
  if (startOfDay(day) < today) return p.onPast()
  if (+startOfDay(day) === +today) {
    const nowH = decHours(p.now)
    if (q + 0.25 <= nowH) return p.onPast()
    if (q < nowH) q = Math.ceil(nowH * 4) / 4
  }
  const h = Math.floor(q), m = Math.round((q - h) * 60)
  p.onSlot(day, `${pad(h)}:${pad(m)}`)
}

function hours(gs: number, ge: number) {
  return Array.from({ length: ge - gs + 1 }, (_, i) => gs + i)
}

export function DayView({ day, bookings, ...p }: GridProps & { day: Date; bookings: Booking[] }) {
  const rows = Math.max(1, p.gridEnd - p.gridStart)
  const H = Math.floor((p.calH - 16) / rows)
  const isToday = dateStr(day) === dateStr(p.now)
  const nowH = decHours(p.now)
  const nowTop = Math.round((nowH - p.gridStart) * H) + TOP
  const past = startOfDay(day) < startOfDay(p.now) ? p.calH : isToday ? Math.max(0, Math.min(nowTop, p.calH)) : 0
  const active = bookings.filter(isActive)

  return (
    <div className="ln-cal">
      <div className="ln-abs" style={{ left: 0, top: 0, bottom: 0, width: 52 }}>
        {hours(p.gridStart, p.gridEnd).map(h => (
          <div key={h} className="ln-abs" style={{ left: 0, top: (h - p.gridStart) * H, fontSize: 13, color: '#6b6158' }}>{fmtHour(h)}</div>
        ))}
      </div>
      <div className="ln-abs" style={{ left: 52, right: 0, top: 0, bottom: 0 }} onClick={e => tapToSlot(e, day, H, p)}>
        {hours(p.gridStart, p.gridEnd).map(h => (
          <div key={h} className="ln-abs" style={{ left: 0, right: 0, top: (h - p.gridStart) * H + TOP, borderTop: '1px solid #ebe3d6' }} />
        ))}
        <div className="ln-abs ln-hatch" style={{ left: 0, right: 0, top: 0, height: past }} />
        {active.map(b => {
          const sp = span(b, day, p.gridStart, p.gridEnd)
          if (!sp) return null
          const { bg, fg } = blockColors(b, p.now)
          const top = Math.round((sp[0] - p.gridStart) * H) + TOP + 1
          const height = Math.max(22, Math.round((sp[1] - sp[0]) * H) - 3)
          const style: React.CSSProperties = { left: 6, right: 6, top, height, background: bg, color: fg }
          const inner = (
            <>
              <span className="ln-serif" style={{ fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{blockLabel(b, p.showTitle)}</span>
              <span style={{ fontSize: 13, opacity: 0.85, whiteSpace: 'nowrap' }}>{fmtClock(new Date(b.start_time))} – {fmtClock(new Date(b.end_time))}</span>
            </>
          )
          return b.is_block
            ? <div key={b.id} className="ln-abs ln-blk" style={style} onClick={e => e.stopPropagation()}>{inner}</div>
            : <button key={b.id} className="ln-abs ln-blk" style={style} onClick={e => { e.stopPropagation(); p.onBooking(b) }}>{inner}</button>
        })}
        {isToday && nowH >= p.gridStart && nowH <= p.gridEnd && (
          <>
            <div className="ln-abs" style={{ left: -6, right: 0, top: nowTop, height: 3, borderRadius: 2, background: '#6f8f6a' }} />
            <div className="ln-abs" style={{ left: -10, top: nowTop - 4, width: 11, height: 11, borderRadius: '50%', background: '#6f8f6a' }} />
          </>
        )}
        {active.length === 0 && (
          <div className="ln-abs ln-serif" style={{ left: 0, right: 0, top: '40%', textAlign: 'center', fontSize: 22, color: '#6b6158', pointerEvents: 'none' }}>
            Nothing booked — the room is all yours
          </div>
        )}
      </div>
    </div>
  )
}

export function WeekView({ weekStart, bookings, onOpenDay, ...p }: GridProps & { weekStart: Date; bookings: Booking[]; onOpenDay: (d: Date) => void }) {
  const rows = Math.max(1, p.gridEnd - p.gridStart)
  const WH = Math.floor((p.calH - 68) / rows)
  const nowTop = Math.round((decHours(p.now) - p.gridStart) * WH) + TOP
  const todayStr = dateStr(p.now)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const active = bookings.filter(isActive)

  return (
    <div className="ln-cal" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', paddingLeft: 44, gap: 6 }}>
        {days.map(d => {
          const t = dateStr(d) === todayStr
          return (
            <button key={dateStr(d)} className="ln-wkhead" onClick={() => onOpenDay(d)} aria-label={`Open ${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`}>
              <span style={{ fontSize: 13, color: '#5e554d' }}>{DAYS_SHORT[d.getDay()]}</span>
              <span className="n" style={{ background: t ? '#2a2522' : 'transparent', color: t ? '#f3ede3' : '#2a2522' }}>{d.getDate()}</span>
            </button>
          )
        })}
      </div>
      <div style={{ position: 'relative', display: 'flex', flexGrow: 1 }}>
        <div style={{ width: 44, position: 'relative' }}>
          {hours(p.gridStart, p.gridEnd).map(h => (
            <div key={h} className="ln-abs" style={{ left: 0, top: (h - p.gridStart) * WH + 1, fontSize: 12, color: '#6b6158' }}>{fmtHour(h, true)}</div>
          ))}
        </div>
        <div style={{ flexGrow: 1, display: 'flex', gap: 6 }}>
          {days.map(d => {
            const ds = dateStr(d)
            const isPastDay = ds < todayStr, isToday = ds === todayStr
            return (
              <div key={ds} onClick={e => tapToSlot(e, d, WH, p)}
                style={{ flex: 1, position: 'relative', borderRadius: 10, overflow: 'hidden', background: isToday ? '#f3ede3' : '#f7f2ea' }}>
                <div className="ln-abs ln-hatch" style={{ left: 0, right: 0, top: 0, height: isPastDay ? p.calH : isToday ? Math.max(0, nowTop) : 0 }} />
                {active.map(b => {
                  const sp = span(b, d, p.gridStart, p.gridEnd)
                  if (!sp) return null
                  const { bg, fg } = blockColors(b, p.now)
                  const style: React.CSSProperties = {
                    left: 3, right: 3, background: bg, color: fg,
                    top: Math.round((sp[0] - p.gridStart) * WH) + TOP + 1,
                    height: Math.max(16, Math.round((sp[1] - sp[0]) * WH) - 3),
                  }
                  return b.is_block
                    ? <div key={b.id} className="ln-abs ln-wkblk" style={style} onClick={e => e.stopPropagation()}>{blockLabel(b, p.showTitle)}</div>
                    : <button key={b.id} className="ln-abs ln-wkblk" style={style} onClick={e => { e.stopPropagation(); p.onBooking(b) }}>{blockLabel(b, p.showTitle)}</button>
                })}
                {isToday && <div className="ln-abs" style={{ left: 0, right: 0, top: nowTop, height: 3, background: '#6f8f6a' }} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function MonthView({ viewDate, bookings, now, calH, onOpenDay }: { viewDate: Date; bookings: Booking[]; now: Date; calH: number; onOpenDay: (d: Date) => void }) {
  const { first, days, rows } = monthGrid(viewDate)
  const cellH = Math.floor((calH - 28 - (rows - 1) * 6) / rows)
  const todayStr = dateStr(now)
  const perDay = new Map<string, number>()
  bookings.filter(isActive).forEach(b => {
    const k = dateStr(new Date(b.start_time))
    perDay.set(k, (perDay.get(k) ?? 0) + 1)
  })

  return (
    <div className="ln-cal" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => (
          <span key={w} style={{ fontSize: 13, color: '#5e554d', textAlign: 'center', height: 22 }}>{w}</span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
        {days.map(d => {
          const ds = dateStr(d)
          const inMonth = d.getMonth() === first.getMonth()
          const past = ds < todayStr, isToday = ds === todayStr
          const count = inMonth ? Math.min(perDay.get(ds) ?? 0, 3) : 0
          return (
            <button key={ds} className="ln-mcell" onClick={() => onOpenDay(d)} aria-label={`Open ${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`}
              style={{
                height: cellH,
                background: inMonth ? (past ? '#f5f0e8' : '#ffffff') : 'transparent',
                border: isToday ? '2px solid #6f8f6a' : `1px solid ${inMonth ? '#ebe3d6' : 'transparent'}`,
              }}>
              <span style={{ fontSize: 15, fontWeight: isToday ? 700 : 500, color: inMonth ? (past ? '#8f8478' : '#2a2522') : '#c2b8a8' }}>{d.getDate()}</span>
              <span className="ln-bars">
                {Array.from({ length: count }, (_, i) => <i key={i} style={{ background: past ? '#d8cebe' : '#2a2522' }} />)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

