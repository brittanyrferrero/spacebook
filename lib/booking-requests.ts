// "Ask them to cancel or change it" requests (ADR-023). Requesters are kept in
// KV until the booking ends, so they can be told if the time frees up.

import type { Redis } from '@upstash/redis'

export interface BookingRequester { name: string; email: string }

const key = (bookingId: string) => `booking:req:${bookingId}`

// Local dev without KV keeps requests in memory, like lib/mock/store does.
const memory = new Map<string, BookingRequester[]>()

async function kv(): Promise<Redis | null> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null
  const { Redis } = await import('@upstash/redis')
  return new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })
}

export async function addRequester(bookingId: string, requester: BookingRequester, bookingEnd: string) {
  const entry = { name: requester.name, email: requester.email.trim().toLowerCase() }
  const client = await kv()
  if (!client) {
    const list = memory.get(key(bookingId)) ?? []
    if (!list.some(r => r.email === entry.email)) list.push(entry)
    memory.set(key(bookingId), list)
    return
  }
  // Keyed by email so a second request from the same person replaces the first.
  await client.hset(key(bookingId), { [entry.email]: entry.name })
  await client.expireat(key(bookingId), Math.ceil(new Date(bookingEnd).getTime() / 1000))
}

export async function takeRequesters(bookingId: string): Promise<BookingRequester[]> {
  const client = await kv()
  if (!client) {
    const list = memory.get(key(bookingId)) ?? []
    memory.delete(key(bookingId))
    return list
  }
  const all = await client.hgetall<Record<string, string>>(key(bookingId))
  if (!all) return []
  await client.del(key(bookingId))
  return Object.entries(all).map(([email, name]) => ({ email, name: String(name) }))
}

export interface FreedBooking {
  id: string
  booker_name: string
  start_time: string
  end_time: string
}

/** Tells everyone who asked about this booking that its time may be free.
 *  Never throws: a cancel or edit must not fail because of this. */
export async function notifyRequesters(booking: FreedBooking, roomName: string, change: 'cancelled' | 'moved', timeZone?: string | null) {
  try {
    const requesters = await takeRequesters(booking.id)
    if (requesters.length === 0) return
    const { sendRequestedSlotFreedEmail } = await import('@/lib/email')
    await Promise.all(requesters.map(r => sendRequestedSlotFreedEmail({
      to: r.email,
      requesterName: r.name,
      bookerName: booking.booker_name,
      roomName,
      startTime: booking.start_time,
      endTime: booking.end_time,
      change,
      timeZone,
    }).catch(err => console.error('[booking-requests] email failed:', err))))
  } catch (err) {
    console.error('[booking-requests] notify failed:', err)
  }
}
