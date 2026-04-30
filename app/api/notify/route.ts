import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// In-memory list for now — swap for an email service (Resend, Mailchimp, etc.) when ready
const emails: { email: string; plan: string; ts: string }[] = []

export async function POST(req: NextRequest) {
  const { email, plan } = await req.json()
  if (!email?.trim()) return NextResponse.json({ error: 'Email required.' }, { status: 400 })
  if (!emails.find(e => e.email === email.trim().toLowerCase())) {
    emails.push({ email: email.trim().toLowerCase(), plan: plan ?? '', ts: new Date().toISOString() })
  }
  console.log('Notify list:', emails)
  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json(emails)
}
