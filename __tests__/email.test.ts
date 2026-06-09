import { describe, it, expect } from 'vitest'
import { isValidEmail } from '@/lib/email'

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
    expect(isValidEmail('brittany@intelligence.org')).toBe(true)
  })

  it('accepts the tablet walk-in placeholder email', () => {
    // regression: walkin@local broke tablet Book Now after email validation was added
    expect(isValidEmail('walkin@tablet.spacebook.app')).toBe(true)
  })

  it('rejects walkin@local — the original broken placeholder', () => {
    expect(isValidEmail('walkin@local')).toBe(false)
  })

  it('rejects invalid formats', () => {
    expect(isValidEmail('notanemail')).toBe(false)
    expect(isValidEmail('@nodomain.com')).toBe(false)
    expect(isValidEmail('missing@dot')).toBe(false)
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail(null)).toBe(false)
    expect(isValidEmail(undefined)).toBe(false)
  })
})
