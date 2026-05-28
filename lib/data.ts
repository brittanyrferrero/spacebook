import type { Room, Booking, CreateBookingPayload, CancelScope } from '@/types'

const MOCK = process.env.MOCK_MODE === 'true'

export async function getRooms(workspaceId?: string): Promise<Room[]> {
  if (MOCK) {
    const [{ getRooms }, { getSessionStore }] = await Promise.all([import('./mock/api'), import('./mock/store')])
    return getRooms(await getSessionStore())
  }
  const { createClient } = await import('./supabase/server')
  const supabase = await createClient()
  let q = supabase.from('rooms').select('*').eq('is_active', true).order('display_order')
  if (workspaceId) q = q.eq('workspace_id', workspaceId)
  const { data } = await q
  const rooms = data ?? []
  const { hasTokens } = await import('./google-calendar/tokenStore')
  const connected = await Promise.all(rooms.map(r => hasTokens(r.id)))
  return rooms.map((r, i) => ({ ...r, gcal_connected: connected[i] }))
}

export async function getAllRooms(workspaceId?: string): Promise<Room[]> {
  if (MOCK) {
    const [{ getAllRooms }, { getSessionStore }] = await Promise.all([import('./mock/api'), import('./mock/store')])
    return getAllRooms(await getSessionStore())
  }
  const { createClient } = await import('./supabase/server')
  const supabase = await createClient()
  let q = supabase.from('rooms').select('*').order('display_order')
  if (workspaceId) q = q.eq('workspace_id', workspaceId)
  const { data } = await q
  const rooms = data ?? []
  const { hasTokens } = await import('./google-calendar/tokenStore')
  const connected = await Promise.all(rooms.map(r => hasTokens(r.id)))
  return rooms.map((r, i) => ({ ...r, gcal_connected: connected[i] }))
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function getBookingsForDate(date: string, roomId?: string, workspaceId?: string): Promise<Booking[]> {
  if (MOCK) {
    const [{ getBookingsForDate }, { getSessionStore }] = await Promise.all([import('./mock/api'), import('./mock/store')])
    return getBookingsForDate(await getSessionStore(), date, roomId)
  }
  const { createClient } = await import('./supabase/server')
  const supabase = await createClient()
  let q = supabase.from('bookings').select('*').gte('start_time', `${shiftDate(date, -1)}T00:00:00Z`).lte('start_time', `${shiftDate(date, +1)}T23:59:59Z`).is('cancelled_at', null)
  if (roomId) q = q.eq('room_id', roomId)
  if (workspaceId) q = q.eq('workspace_id', workspaceId)
  const { data } = await q
  return data ?? []
}

export async function getBookingById(id: string, workspaceId?: string): Promise<Booking | null> {
  if (MOCK) {
    const [{ getBookingById }, { getSessionStore }] = await Promise.all([import('./mock/api'), import('./mock/store')])
    return getBookingById(await getSessionStore(), id)
  }
  const { createClient } = await import('./supabase/server')
  const supabase = await createClient()
  let q = supabase.from('bookings').select('*').eq('id', id)
  if (workspaceId) q = q.eq('workspace_id', workspaceId)
  const { data } = await q.single()
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

export async function getBookingsForRange(from: string, to: string, roomId?: string, workspaceId?: string): Promise<Booking[]> {
  if (MOCK) {
    const [{ getBookingsForRange }, { getSessionStore }] = await Promise.all([import('./mock/api'), import('./mock/store')])
    return getBookingsForRange(await getSessionStore(), from, to, roomId)
  }
  const { createClient } = await import('./supabase/server')
  const supabase = await createClient()
  let q = supabase.from('bookings').select('*').gte('start_time', `${shiftDate(from, -1)}T00:00:00Z`).lte('start_time', `${shiftDate(to, +1)}T23:59:59Z`).is('cancelled_at', null)
  if (roomId) q = q.eq('room_id', roomId)
  if (workspaceId) q = q.eq('workspace_id', workspaceId)
  const { data } = await q
  return data ?? []
}

export async function getRoomById(id: string, workspaceId?: string): Promise<Room | null> {
  const rooms = await getRooms(workspaceId)
  return rooms.find(r => r.id === id) ?? null
}
