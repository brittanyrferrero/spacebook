import { NextResponse } from 'next/server'

export async function GET() {
  const res = NextResponse.json({ ok: true })
  const token = process.env.WORKSPACE_TOKEN
  if (token) {
    res.cookies.set('ws_access', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    })
  }
  res.cookies.set('admin_auth', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  })
  return res
}
