import { type NextRequest } from 'next/server'

export async function GET() {
  if (process.env.MOCK_MODE === 'true') {
    const [{ getRoomTypes }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    return Response.json(getRoomTypes(await getSessionStore()))
  }
  const { getRoomTypes } = await import('@/lib/prod-config')
  return Response.json(await getRoomTypes())
}

export async function POST(req: NextRequest) {
  const { type } = await req.json()
  if (!type?.trim()) return Response.json({ error: 'type required' }, { status: 400 })

  if (process.env.MOCK_MODE === 'true') {
    const [{ addRoomType }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const result = addRoomType(store, type.trim())
    if ('error' in result) return Response.json(result, { status: 409 })
    await saveSessionStore(store)
    return Response.json(result, { status: 201 })
  }

  const { getRoomTypes, setRoomTypes } = await import('@/lib/prod-config')
  const types = await getRoomTypes()
  if (types.includes(type.trim())) return Response.json({ error: 'Already exists' }, { status: 409 })
  await setRoomTypes([...types, type.trim()])
  return Response.json({ type: type.trim() }, { status: 201 })
}
