import { type NextRequest } from 'next/server'
import { getRooms } from '@/lib/data'

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get('all') === '1'
  if (all && process.env.MOCK_MODE === 'true') {
    const [{ getAllRooms }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    return Response.json(getAllRooms(await getSessionStore()))
  }
  const rooms = await getRooms()
  return Response.json(rooms)
}

export async function POST(req: NextRequest) {
  const data = await req.json()
  if (!data.name || !data.capacity) return Response.json({ error: 'name and capacity required' }, { status: 400 })

  if (process.env.MOCK_MODE === 'true') {
    const [{ createRoom }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    return Response.json(createRoom(await getSessionStore(), data), { status: 201 })
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: room, error } = await supabase.from('rooms').insert(data).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(room, { status: 201 })
}
