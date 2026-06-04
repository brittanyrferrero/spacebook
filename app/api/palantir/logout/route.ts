import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { appUrl } from '@/lib/email'

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.delete('palantir_session')
  return NextResponse.redirect(new URL('/palantir-enter', appUrl()))
}
