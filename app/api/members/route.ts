import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET() {
  if (process.env.MOCK_MODE === 'true') {
    const [{ getMembers }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    return NextResponse.json(getMembers(await getSessionStore()))
  }
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data } = await supabase.from('members').select('*').order('name')
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { name, email } = await req.json()
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 })
  }

  if (process.env.MOCK_MODE === 'true') {
    const [{ addMember }, { getSessionStore, saveSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const store = await getSessionStore()
    const result = addMember(store, name.trim(), email.trim().toLowerCase())
    if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })
    await saveSessionStore(store)
    return NextResponse.json(result.member, { status: 201 })
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data, error } = await supabase.from('members').upsert({ name: name.trim(), email: email.trim().toLowerCase() }, { onConflict: 'email' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
