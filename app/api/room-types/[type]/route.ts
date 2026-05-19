import { type NextRequest } from 'next/server'

export async function DELETE(_: NextRequest, { params }: { params: { type: string } }) {
  const type = decodeURIComponent(params.type)

  if (process.env.MOCK_MODE === 'true') {
    const [{ deleteRoomType }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const ok = deleteRoomType(store, type)
    if (!ok) return Response.json({ error: 'Not found' }, { status: 404 })
    await saveSessionStore(store)
    return Response.json({ ok: true })
  }

  const { getRoomTypes, setRoomTypes } = await import('@/lib/prod-config')
  const types = await getRoomTypes()
  if (!types.includes(type)) return Response.json({ error: 'Not found' }, { status: 404 })
  await setRoomTypes(types.filter(t => t !== type))
  return Response.json({ ok: true })
}
