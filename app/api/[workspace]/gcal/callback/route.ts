import { type NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function GET(req: NextRequest, { params }: { params: { workspace: string } }) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const stateRaw = searchParams.get('state')
  const error = searchParams.get('error')

  const adminUrl = new URL(`/${params.workspace}/admin`, req.url)
  adminUrl.searchParams.set('tab', 'Rooms')

  let roomId: string | null = null
  try {
    const state = JSON.parse(stateRaw ?? '{}')
    roomId = state.roomId ?? null
  } catch { /* ignore */ }

  if (error || !code || !roomId) {
    adminUrl.searchParams.set('gcal', 'error')
    return NextResponse.redirect(adminUrl)
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/${params.workspace}/gcal/callback`,
    )

    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      adminUrl.searchParams.set('gcal', 'no_refresh_token')
      return NextResponse.redirect(adminUrl)
    }

    const { saveTokens } = await import('@/lib/google-calendar/tokenStore')
    await saveTokens(roomId, {
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token ?? undefined,
      expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
    })

    adminUrl.searchParams.set('gcal', 'pick')
    adminUrl.searchParams.set('room_id', roomId)
    return NextResponse.redirect(adminUrl)
  } catch {
    adminUrl.searchParams.set('gcal', 'error')
    return NextResponse.redirect(adminUrl)
  }
}
