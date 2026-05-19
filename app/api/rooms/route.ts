import { type NextRequest } from 'next/server'
import { getRooms } from '@/lib/data'

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get('all') === '1'
  if (process.env.MOCK_MODE === 'true') {
    const [{ getRooms: getMockRooms, getAllRooms }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    return Response.json(all ? getAllRooms(store) : getMockRooms(store))
  }
  if (all) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data } = await supabase.from('rooms').select('*').order('display_order')
    return Response.json(data ?? [])
  }
  const rooms = await getRooms()
  return Response.json(rooms)
}

export async function POST(req: NextRequest) {
  const data = await req.json()
  if (!data.name || !data.capacity) return Response.json({ error: 'name and capacity required' }, { status: 400 })

  if (process.env.MOCK_MODE === 'true') {
    const [{ createRoom }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const room = createRoom(store, data)
    await saveSessionStore(store)
    return Response.json(room, { status: 201 })
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: room, error } = await supabase.from('rooms').insert(data).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(room, { status: 201 })
}
