import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getMembers, addMember } from '@/lib/mock/api'
import { getSessionStore } from '@/lib/mock/store'

export async function GET() {
  return NextResponse.json(getMembers(await getSessionStore()))
}

export async function POST(req: NextRequest) {
  const { name, email } = await req.json()
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 })
  }
  const store = await getSessionStore()
  const result = addMember(store, name.trim(), email.trim().toLowerCase())
  if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })
  return NextResponse.json(result.member, { status: 201 })
}
