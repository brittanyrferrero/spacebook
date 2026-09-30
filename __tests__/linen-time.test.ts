import { describe, it, expect } from 'vitest'
import type { Booking } from '@/types'
import { roomStatus, durationConflicts, fmtDur, fmtClock, blockLabel, monthGrid, hourAfter } from '@/components/tablet/linen/time'

const at = (h: number, m = 0) => new Date(2026, 8, 28, h, m, 0, 0)
function bk(start: Date, end: Date, extra: Partial<Booking> = {}): Booking {
  return {
    id: `${+start}`, room_id: 'r1', recurring_series_id: null, booker_name: 'A', booker_email: 'a@example.org',
    title: null, start_time: start.toISOString(), end_time: end.toISOString(), cancel_token: 't',
    google_event_id: null, cancelled_at: null, created_at: start.toISOString(), ...extra,
  }
}

describe('roomStatus', () => {
  const day = [bk(at(9), at(10)), bk(at(11, 30), at(12, 30)), bk(at(14), at(15, 30))]

  it('is free until the next booking, counting whole minutes', () => {
    const s = roomStatus(day, at(10, 42))
    expect(s.current).toBeNull()
    expect(s.next?.start_time).toBe(at(11, 30).toISOString())
    expect(s.minutes).toBe(48)
  })

  it('is busy during a booking, with minutes until it ends', () => {
    const s = roomStatus(day, at(11, 40))
    expect(s.current?.start_time).toBe(at(11, 30).toISOString())
    expect(s.minutes).toBe(50)
  })

  it('has no end when nothing else is booked today', () => {
    expect(roomStatus(day, at(16)).minutes).toBeNull()
  })

  it("never treats tomorrow's first booking as today's next one", () => {
    const tomorrow9 = new Date(2026, 8, 29, 9, 0)
    const s = roomStatus([...day, bk(tomorrow9, new Date(2026, 8, 29, 10, 0))], at(17, 37))
    expect(s.next).toBeNull()
    expect(s.minutes).toBeNull()
  })

  it('ignores cancelled bookings', () => {
    const cancelled = [bk(at(10), at(12), { cancelled_at: at(9).toISOString() })]
    expect(roomStatus(cancelled, at(11)).current).toBeNull()
  })

  it('treats admin blocks as busy', () => {
    expect(roomStatus([bk(at(10), at(12), { is_block: true })], at(11)).current).not.toBeNull()
  })
})

describe('durationConflicts', () => {
  const day = [bk(at(11, 30), at(12, 30))]
  it('allows a walk-in that ends before the next booking', () => {
    expect(durationConflicts(day, at(10, 42), 30)).toBe(false)
  })
  it('blocks a walk-in that would run into the next booking', () => {
    expect(durationConflicts(day, at(10, 42), 60)).toBe(true)
  })
})

describe('formatting', () => {
  it('formats durations the way the display reads', () => {
    expect(fmtDur(48)).toBe('48 minutes')
    expect(fmtDur(1)).toBe('1 minute')
    expect(fmtDur(60)).toBe('1 hr')
    expect(fmtDur(118)).toBe('1 hr 58 min')
  })
  it('uses a 12-hour clock', () => {
    expect(fmtClock(at(10, 42))).toBe('10:42')
    expect(fmtClock(at(0, 5))).toBe('12:05')
    expect(fmtClock(at(13, 0))).toBe('1:00')
  })
  it('fills an end time one hour later, capped at 11pm like Classic', () => {
    expect(hourAfter('13:15')).toBe('14:15')
    expect(hourAfter('22:30')).toBe('23:00')
  })
})

describe('blockLabel', () => {
  it('hides titles unless the workspace shows them', () => {
    expect(blockLabel(bk(at(9), at(10), { title: 'Board' }), false)).toBe('Occupied')
    expect(blockLabel(bk(at(9), at(10), { title: 'Board' }), true)).toBe('Board')
    expect(blockLabel(bk(at(9), at(10), { title: 'Board', recurring_series_id: 's' }), true)).toBe('↻ Board')
  })
  it('labels admin blocks even when titles are hidden', () => {
    expect(blockLabel(bk(at(9), at(10), { is_block: true }), false)).toBe('Unavailable')
  })
})

describe('monthGrid', () => {
  it('starts on Monday and covers the whole month', () => {
    const g = monthGrid(at(12))            // September 2026 starts on a Tuesday
    expect(g.days[0].getDate()).toBe(31)   // Mon 31 Aug
    expect(g.rows).toBe(5)
    expect(g.days.some(d => d.getMonth() === 8 && d.getDate() === 30)).toBe(true)
  })
})
