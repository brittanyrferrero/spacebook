import { type NextRequest } from 'next/server'

export async function DELETE(_: NextRequest, { params }: { params: { amenity: string } }) {
  const amenity = decodeURIComponent(params.amenity)

  if (process.env.MOCK_MODE === 'true') {
    const [{ deleteAmenityOption }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const ok = deleteAmenityOption(store, amenity)
    if (!ok) return Response.json({ error: 'Not found' }, { status: 404 })
    await saveSessionStore(store)
    return Response.json({ ok: true })
  }

  const { getAmenityOptions, setAmenityOptions } = await import('@/lib/prod-config')
  const options = await getAmenityOptions()
  if (!options.includes(amenity)) return Response.json({ error: 'Not found' }, { status: 404 })
  await setAmenityOptions(options.filter(a => a !== amenity))
  return Response.json({ ok: true })
}
