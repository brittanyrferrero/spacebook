import { describe, it, expect } from 'vitest'
import { fmtDate, fmtTimeRange } from '@/lib/email'

describe('email times', () => {
  const start = '2026-10-06T22:00:00Z', end = '2026-10-06T23:00:00Z'   // 3–4 PM in Los Angeles

  it('uses the workspace time zone and names it', () => {
    expect(fmtDate(start, 'America/Los_Angeles')).toBe('Tuesday, October 6')
    expect(fmtTimeRange(start, end, 'America/Los_Angeles')).toBe('3:00 – 4:00 PM PDT')
  })
  it('shows both AM and PM when a booking straddles noon', () => {
    expect(fmtTimeRange('2026-10-06T18:30:00Z', '2026-10-06T20:00:00Z', 'America/Los_Angeles')).toBe('11:30 AM – 1:00 PM PDT')
  })
  it('the date follows the zone, not UTC', () => {
    expect(fmtDate('2026-10-07T02:00:00Z', 'America/Los_Angeles')).toBe('Tuesday, October 6')
  })
  it('falls back to UTC, labelled, when the zone is unknown or invalid', () => {
    expect(fmtTimeRange(start, end, null)).toBe('10:00 – 11:00 PM UTC')
    expect(fmtTimeRange(start, end, 'Not/AZone')).toBe('10:00 – 11:00 PM UTC')
  })
})
