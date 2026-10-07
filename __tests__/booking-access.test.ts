import { describe, it, expect } from 'vitest'
import { accessFor, isJustMade, isPlaceholderEmail, reasonError, shouldNotifyBooker, JUST_MADE_MS } from '@/lib/booking-access'

const now = new Date('2026-10-06T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
const booking = (over: Partial<{ booker_email: string; created_at: string; origin: string }> = {}) => ({
  booker_email: 'sam@example.com', created_at: ago(60 * 60_000), origin: 'desktop', ...over,
})

describe('isJustMade', () => {
  it('is true inside the 5-minute window and false at its edge', () => {
    expect(isJustMade(booking({ created_at: ago(0) }), now)).toBe(true)
    expect(isJustMade(booking({ created_at: ago(JUST_MADE_MS - 1) }), now)).toBe(true)
    expect(isJustMade(booking({ created_at: ago(JUST_MADE_MS) }), now)).toBe(false)
  })
  it('never counts Google Calendar bookings, whose created_at is the sync time', () => {
    expect(isJustMade(booking({ created_at: ago(1000), origin: 'gcal' }), now)).toBe(false)
  })
  it('ignores a created_at in the future', () => {
    expect(isJustMade(booking({ created_at: ago(-60_000) }), now)).toBe(false)
  })
})

describe('isPlaceholderEmail', () => {
  it('matches the walk-in addresses, case-insensitively', () => {
    expect(isPlaceholderEmail('walkin@tablet.spacebook.app')).toBe(true)
    expect(isPlaceholderEmail('WalkIn@Local')).toBe(true)
    expect(isPlaceholderEmail('sam@example.com')).toBe(false)
    expect(isPlaceholderEmail(undefined)).toBe(false)
  })
})

describe('accessFor', () => {
  const opts = { isAdmin: false, mbEmail: null, now }
  it('needs a reason for someone else’s older booking', () => {
    expect(accessFor(booking(), opts)).toBe('needs-reason')
  })
  it('is direct for an admin, the verified owner, or a just-made booking', () => {
    expect(accessFor(booking(), { ...opts, isAdmin: true })).toBe('direct')
    expect(accessFor(booking(), { ...opts, mbEmail: 'SAM@example.com' })).toBe('direct')
    expect(accessFor(booking({ created_at: ago(60_000) }), opts)).toBe('direct')
  })
  it('an older walk-in needs a reason too: its booker is unknown, not absent', () => {
    expect(accessFor(booking({ booker_email: 'walkin@tablet.spacebook.app' }), opts)).toBe('needs-reason')
    expect(accessFor(booking({ booker_email: 'walkin@tablet.spacebook.app', created_at: ago(60_000) }), opts)).toBe('direct')
  })
  it('a different verified email does not help', () => {
    expect(accessFor(booking(), { ...opts, mbEmail: 'alex@example.com' })).toBe('needs-reason')
  })
})

describe('reasonError', () => {
  it('needs nothing for direct access', () => {
    expect(reasonError('direct', undefined, '')).toBeNull()
  })
  it('requires a reason, and a name for "permission"', () => {
    expect(reasonError('needs-reason', undefined, '')).toMatch(/your meeting/)
    expect(reasonError('needs-reason', 'bogus', '')).toMatch(/your meeting/)
    expect(reasonError('needs-reason', 'mine', '')).toBeNull()
    expect(reasonError('needs-reason', 'permission', '  ')).toMatch(/name/)
    expect(reasonError('needs-reason', 'permission', 'Alex')).toBeNull()
  })
})

describe('shouldNotifyBooker', () => {
  it('only for changes that needed a reason, and never for walk-ins', () => {
    expect(shouldNotifyBooker('needs-reason', 'sam@example.com')).toBe(true)
    expect(shouldNotifyBooker('direct', 'sam@example.com')).toBe(false)
    expect(shouldNotifyBooker('needs-reason', 'walkin@tablet.spacebook.app')).toBe(false)
  })
})
