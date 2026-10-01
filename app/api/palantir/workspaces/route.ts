import { cookies } from 'next/headers'
import { readPalantirSession } from '@/lib/auth-cookies'

async function requirePalantir() {
  const cookieStore = await cookies()
  return readPalantirSession(cookieStore)
}

export async function GET() {
  if (!await requirePalantir()) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const [{ data: workspaces }, { data: rooms }, { data: members }, { data: bookings }] = await Promise.all([
    supabase.from('workspaces').select('id, name, slug, created_at').order('created_at', { ascending: false }),
    supabase.from('rooms').select('id, workspace_id, is_active'),
    supabase.from('members').select('id, workspace_id'),
    supabase.from('bookings').select('workspace_id, created_at').is('cancelled_at', null).order('created_at', { ascending: false }),
  ])

  const roomsByWs: Record<string, number> = {}
  for (const r of rooms ?? []) {
    if (r.is_active) roomsByWs[r.workspace_id] = (roomsByWs[r.workspace_id] ?? 0) + 1
  }

  const membersByWs: Record<string, number> = {}
  for (const m of members ?? []) {
    membersByWs[m.workspace_id] = (membersByWs[m.workspace_id] ?? 0) + 1
  }

  const bookingCountByWs: Record<string, number> = {}
  const lastBookingByWs: Record<string, string> = {}
  for (const b of bookings ?? []) {
    bookingCountByWs[b.workspace_id] = (bookingCountByWs[b.workspace_id] ?? 0) + 1
    if (!lastBookingByWs[b.workspace_id]) lastBookingByWs[b.workspace_id] = b.created_at
  }

  const { getLimits } = await import('@/lib/prod-config')
  const limitsArr = await Promise.all((workspaces ?? []).map(w => getLimits(w.id)))
  const limitsByWs: Record<string, any> = {}
  ;(workspaces ?? []).forEach((w, i) => { limitsByWs[w.id] = limitsArr[i] })

  const result = (workspaces ?? []).map(w => ({
    ...w,
    room_count: roomsByWs[w.id] ?? 0,
    member_count: membersByWs[w.id] ?? 0,
    booking_count: bookingCountByWs[w.id] ?? 0,
    last_booking_at: lastBookingByWs[w.id] ?? null,
    limits: limitsByWs[w.id] ?? null,
  }))

  return Response.json(result)
}
