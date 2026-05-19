import { type NextRequest } from 'next/server'

export async function GET() {
  if (process.env.MOCK_MODE === 'true') {
    const [{ getAmenityOptions }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    return Response.json(getAmenityOptions(await getSessionStore()))
  }
  const { getAmenityOptions } = await import('@/lib/prod-config')
  return Response.json(await getAmenityOptions())
}

export async function POST(req: NextRequest) {
  const { amenity } = await req.json()
  if (!amenity?.trim()) return Response.json({ error: 'amenity required' }, { status: 400 })

  if (process.env.MOCK_MODE === 'true') {
    const [{ addAmenityOption }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const result = addAmenityOption(store, amenity.trim())
    if ('error' in result) return Response.json(result, { status: 409 })
    await saveSessionStore(store)
    return Response.json(result, { status: 201 })
  }

  const { getAmenityOptions, setAmenityOptions } = await import('@/lib/prod-config')
  const options = await getAmenityOptions()
  if (options.includes(amenity.trim())) return Response.json({ error: 'Already exists' }, { status: 409 })
  await setAmenityOptions([...options, amenity.trim()])
  return Response.json({ amenity: amenity.trim() }, { status: 201 })
}
