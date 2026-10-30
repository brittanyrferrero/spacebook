import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { name, email } = await req.json()
  if (!name?.trim() || !email?.trim())
    return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 })

  if (process.env.MOCK_MODE === 'true') {
    const [{ updateMember }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const result = updateMember(store, params.id, name.trim(), email.trim().toLowerCase())
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.error.includes('not found') ? 404 : 409 })
    await saveSessionStore(store)
    return NextResponse.json(result.member)
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data, error } = await supabase.from('members').update({ name: name.trim(), email: email.trim().toLowerCase() }).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (process.env.MOCK_MODE === 'true') {
    const [{ removeMember }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const ok = removeMember(store, params.id)
    if (!ok) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
    await saveSessionStore(store)
    return NextResponse.json({ ok: true })
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { error } = await supabase.from('members').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
