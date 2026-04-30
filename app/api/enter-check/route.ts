import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const valid = !!token && token === process.env.WORKSPACE_TOKEN
  return valid ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false }, { status: 401 })
}
