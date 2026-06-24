import { type NextRequest } from 'next/server'
import { getBookingsForDate } from '@/lib/data'
import type { CreateBookingPayload } from '@/types'
import { waitUntil } from '@vercel/functions'

export async function GET(req: NextRequest) {
  if (process.env.MOCK_MODE !== 'true') return Response.json({ error: 'Use workspace-scoped endpoint' }, { status: 410 })
  const { searchParams } = req.nextUrl
  const roomId = searchParams.get('room_id') ?? undefined
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const email = searchParams.get('email')
  const [{ getBookingsByEmail, getBookingsForDate: mockDate, getBookingsForRange: mockRange }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
  const store = await getSessionStore()
  if (email) return Response.json(getBookingsByEmail(store, email))
  if (from && to) return Response.json(mockRange(store, from, to, roomId))
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  return Response.json(mockDate(store, date, roomId))
}

export async function POST(req: NextRequest) {
  if (process.env.MOCK_MODE !== 'true') return Response.json({ error: 'Use workspace-scoped endpoint' }, { status: 410 })
  const payload: CreateBookingPayload = await req.json()
  if (!payload.room_id || !payload.booker_name || !payload.booker_email || !payload.start_time || !payload.end_time) {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 })
  }
  const [{ createBooking }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
  const store = await getSessionStore()
  const result = createBooking(store, payload)
  if (result.error) return Response.json({ error: result.error }, { status: 409 })
  await saveSessionStore(store)
  return Response.json(result, { status: 201 })
}
