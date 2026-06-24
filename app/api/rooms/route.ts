import { type NextRequest } from 'next/server'
import { getRooms } from '@/lib/data'

export async function GET(req: NextRequest) {
  if (process.env.MOCK_MODE !== 'true') return Response.json({ error: 'Use workspace-scoped endpoint' }, { status: 410 })
  const all = req.nextUrl.searchParams.get('all') === '1'
  const [{ getRooms: getMockRooms, getAllRooms }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
  const store = await getSessionStore()
  return Response.json(all ? getAllRooms(store) : getMockRooms(store))
}

export async function POST(req: NextRequest) {
  if (process.env.MOCK_MODE !== 'true') return Response.json({ error: 'Use workspace-scoped endpoint' }, { status: 410 })
  const data = await req.json()
  if (!data.name || !data.capacity) return Response.json({ error: 'name and capacity required' }, { status: 400 })
  const [{ createRoom }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
  const store = await getSessionStore()
  const room = createRoom(store, data)
  await saveSessionStore(store)
  return Response.json(room, { status: 201 })
}
