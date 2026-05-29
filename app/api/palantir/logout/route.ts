import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.delete('palantir_session')
  return NextResponse.redirect(new URL('/palantir-enter', process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'))
}
