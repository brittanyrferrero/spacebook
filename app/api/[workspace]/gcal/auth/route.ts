import { type NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { appUrl } from '@/lib/email'

export async function GET(req: NextRequest, { params }: { params: { workspace: string } }) {
  const roomId = req.nextUrl.searchParams.get('room_id')
  if (!roomId) return Response.json({ error: 'room_id required' }, { status: 400 })

  const base = appUrl()
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return Response.json({ error: 'Google OAuth not configured.' }, { status: 503 })
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${base}/api/gcal/callback`,
  )

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'],
    state: JSON.stringify({ workspace: params.workspace, roomId }),
  })

  return NextResponse.redirect(url)
}
