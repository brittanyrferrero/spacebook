import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { setPalantirCookie } from '@/lib/auth-cookies'

async function kv() {
  const { Redis } = await import('@upstash/redis')
  return new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const r = await kv()
  const email = await r.get<string>(`palantir:token:${params.token}`)
  if (!email) return NextResponse.redirect(new URL('/palantir-enter?error=expired', _req.url))

  await r.del(`palantir:token:${params.token}`)

  const cookieStore = await cookies()
  await setPalantirCookie(cookieStore, email)

  return NextResponse.redirect(new URL('/palantir', _req.url))
}
