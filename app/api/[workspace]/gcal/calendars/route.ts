import { type NextRequest } from 'next/server'
import { google } from 'googleapis'

export async function GET(req: NextRequest, props: { params: Promise<{ workspace: string }> }) {
  const params = await props.params;
  const adminRole = req.cookies.get(`admin_${params.workspace}`)?.value
  if (!adminRole) return Response.json({ error: 'Admin required.' }, { status: 403 })

  const roomId = req.nextUrl.searchParams.get('room_id')
  if (!roomId) return Response.json({ error: 'room_id required' }, { status: 400 })

  const { getTokens, saveTokens } = await import('@/lib/google-calendar/tokenStore')
  const tokens = await getTokens(roomId)
  if (!tokens) return Response.json({ error: 'Not connected' }, { status: 401 })

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )

  oauth2Client.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_date: tokens.expiry ? new Date(tokens.expiry).getTime() : undefined,
  })

  oauth2Client.on('tokens', async (newTokens) => {
    await saveTokens(roomId, {
      refresh_token: tokens.refresh_token,
      access_token: newTokens.access_token ?? undefined,
      expiry: newTokens.expiry_date ? new Date(newTokens.expiry_date).toISOString() : undefined,
    })
  })

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
  const { data } = await calendar.calendarList.list({ minAccessRole: 'writer' })

  const calendars = (data.items ?? []).map(c => ({
    id: c.id,
    summary: c.summary,
    primary: c.primary ?? false,
    backgroundColor: c.backgroundColor,
  }))

  return Response.json(calendars)
}
