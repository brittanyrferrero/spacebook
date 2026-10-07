// "Ask them" emails (ADR-023): the requester's address is typed, not verified,
// so their receipt must not carry anything they wrote.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sent = vi.hoisted(() => [] as Record<string, string>[])
vi.mock('resend', () => ({
  Resend: class { emails = { send: async (msg: Record<string, string>) => { sent.push(msg) } } },
}))

const { sendBookingRequestEmail } = await import('@/lib/email')

beforeEach(() => {
  sent.length = 0
  process.env.RESEND_API_KEY = 'test'
})

describe('sendBookingRequestEmail', () => {
  it('sends the note to the booker, replying to the requester, and the receipt carries nothing the requester typed', async () => {
    await sendBookingRequestEmail({
      bookerEmail: 'sam@example.com', bookerName: 'Sam Lee',
      requesterName: 'https://evil.example/name', requesterEmail: 'alex@example.com',
      note: 'Visit evil.example now', kind: 'cancel',
      roomName: 'Recording Studio', title: null, cancelToken: 'tok',
      startTime: '2026-10-07T22:00:00Z', endTime: '2026-10-07T23:00:00Z', timeZone: 'America/Los_Angeles',
    })
    const [toBooker, receipt] = sent
    expect(toBooker).toMatchObject({ to: 'sam@example.com', replyTo: 'alex@example.com' })
    expect(toBooker.html).toContain('Visit evil.example now')
    expect(toBooker.html).toContain('https://evil.example/name')
    expect(receipt.to).toBe('alex@example.com')
    expect(receipt.html).not.toContain('evil.example')
    expect(receipt.html).not.toContain('/cancel/tok')
    expect(receipt.html).not.toContain('sam@example.com')
  })
})
