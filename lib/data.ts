import type { Room, Booking, CreateBookingPayload, CancelScope } from '@/types'

const MOCK = process.env.MOCK_MODE === 'true'

export async function getRooms(): Promise<Room[]> {
  if (MOCK) {
    const [{ getRooms }, { getSessionStore }] = await Promise.all([import('./mock/api'), import('./mock/store')])
    return getRooms(await getSessionStore())
  }
  const { createClient } = await import('./supabase/server')
  const supabase = await createClient()
  const { data } = await supabase.from('rooms').select('*').eq('is_active', true).order('display_order')
  return data ?? []
}

export async function getBookingsForDate(date: string, roomId?: string): Promise<Booking[]> {
  if (MOCK) {
    const [{ getBookingsForDate }, { getSessionStore }] = await Promise.all([import('./mock/api'), import('./mock/store')])
    return getBookingsForDate(await getSessionStore(), date, roomId)
  }
  const { createClient } = await import('./supabase/server')
  const supabase = await createClient()
  let q = supabase.from('bookings').select('*').gte('start_time', `${date}T00:00:00Z`).lte('start_time', `${date}T23:59:59Z`).is('cancelled_at', null)
  if (roomId) q = q.eq('room_id', roomId)
  const { data } = await q
  return data ?? []
}

export async function getBookingById(id: string): Promise<Booking | null> {
  if (MOCK) {
    const [{ getBookingById }, { getSessionStore }] = await Promise.all([import('./mock/api'), import('./mock/store')])
    return getBookingById(await getSessionStore(), id)
  }
  const { createClient } = await import('./supabase/server')
  const supabase = await createClient()
  const { data } = await supabase.from('bookings').select('*').eq('id', id).single()
  return data ?? null
}

export async function getBookingByToken(token: string): Promise<Booking | null> {
  if (MOCK) {
    const [{ getBookingByToken }, { getSessionStore }] = await Promise.all([import('./mock/api'), import('./mock/store')])
    return getBookingByToken(await getSessionStore(), token)
  }
  const { createClient } = await import('./supabase/server')
  const supabase = await createClient()
  const { data } = await supabase.from('bookings').select('*').eq('cancel_token', token).single()
  return data ?? null
}

export async function getBookingsForRange(from: string, to: string, roomId?: string): Promise<Booking[]> {
  if (MOCK) {
    const [{ getBookingsForRange }, { getSessionStore }] = await Promise.all([import('./mock/api'), import('./mock/store')])
    return getBookingsForRange(await getSessionStore(), from, to, roomId)
  }
  const { createClient } = await import('./supabase/server')
  const supabase = await createClient()
  let q = supabase.from('bookings').select('*').gte('start_time', `${from}T00:00:00Z`).lte('start_time', `${to}T23:59:59Z`).is('cancelled_at', null)
  if (roomId) q = q.eq('room_id', roomId)
  const { data } = await q
  return data ?? []
}

export async function getRoomById(id: string): Promise<Room | null> {
  const rooms = await getRooms()
  return rooms.find(r => r.id === id) ?? null
}
