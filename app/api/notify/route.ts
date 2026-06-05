import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { google } from 'googleapis'
import { ratelimit, getIP } from '@/lib/ratelimit'

const rl = ratelimit(5, '1 h')

const SHEET_ID   = process.env.GOOGLE_SHEET_ID
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME ?? 'Sheet1'

async function getSheets() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? '{}')
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

export async function POST(req: NextRequest) {
  const { success } = await rl.limit(getIP(req))
  if (!success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  const { email, plan } = await req.json()
  if (!email?.trim()) return NextResponse.json({ error: 'Email required.' }, { status: 400 })

  try {
    const sheets = await getSheets()
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:C`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[email.trim().toLowerCase(), plan ?? '', new Date().toISOString()]],
      },
    })
  } catch (err) {
    console.error('Sheets error:', err)
    return NextResponse.json({ error: 'Failed to save.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
