import { type NextRequest } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const patch = await req.json()

  if (process.env.MOCK_MODE === 'true') {
    const [{ updateRoom }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const room = updateRoom(await getSessionStore(), params.id, patch)
    if (!room) return Response.json({ error: 'Room not found' }, { status: 404 })
    return Response.json(room)
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data, error } = await supabase.from('rooms').update(patch).eq('id', params.id).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (process.env.MOCK_MODE === 'true') {
    const [{ deleteRoom }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const result = deleteRoom(await getSessionStore(), params.id)
    if (!result.ok) return Response.json({ error: 'Room not found' }, { status: 404 })
    return Response.json(result)
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { error } = await supabase.from('rooms').delete().eq('id', params.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, hasBookings: false })
}
