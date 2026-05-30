import { type NextRequest } from 'next/server'

async function kv() {
  const { Redis } = await import('@upstash/redis')
  return new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const r = await kv()
  const raw = await r.get(`delete_request:token:${params.token}`)

  if (!raw) {
    return new Response(
      `<html><body style="font-family:sans-serif;max-width:480px;margin:80px auto;padding:24px">
        <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:8px">spacebook</div>
        <p style="color:#374151">This link has expired or already been used.</p>
      </body></html>`,
      { status: 410, headers: { 'Content-Type': 'text/html' } }
    )
  }

  const data = typeof raw === 'string' ? JSON.parse(raw) : (raw as any)

  await r.set(`delete_request:pending:${data.workspaceId}`, JSON.stringify({
    ...data,
    confirmedAt: new Date().toISOString(),
  }))
  await r.del(`delete_request:token:${params.token}`)

  return new Response(
    `<html><body style="font-family:sans-serif;max-width:480px;margin:80px auto;padding:24px">
      <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:8px">spacebook</div>
      <p style="font-size:15px;color:#374151;margin-bottom:8px">Deletion request confirmed for <strong>${data.workspaceName}</strong>.</p>
      <p style="font-size:13px;color:#6B7280">The spacebook team has been notified and will review this request. Nothing has been deleted yet.</p>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  )
}
