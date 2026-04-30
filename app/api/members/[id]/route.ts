import { NextResponse } from 'next/server'
import { removeMember } from '@/lib/mock/api'
import { getSessionStore } from '@/lib/mock/store'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ok = removeMember(await getSessionStore(), params.id)
  if (!ok) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
