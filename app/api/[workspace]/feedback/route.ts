import { type NextRequest } from 'next/server'
import { google } from 'googleapis'

const SHEET_ID = process.env.GOOGLE_SHEET_ID

async function getSheets() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? '{}')
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

export async function POST(req: NextRequest, props: { params: Promise<{ workspace: string }> }) {
  const params = await props.params;
  const { name, email, message } = await req.json()
  if (!message?.trim()) return Response.json({ error: 'Message required.' }, { status: 400 })

  try {
    const sheets = await getSheets()
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'feedback!A:D',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toLocaleString('en-AU'),
          name?.trim() || '',
          email?.trim() || '',
          message.trim(),
          params.workspace,
        ]],
      },
    })
  } catch (err) {
    console.error('Feedback sheet error:', err)
    return Response.json({ error: 'Failed to save.' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
