import { cookies } from 'next/headers'

export async function POST(_req: Request, { params }: { params: { workspace: string } }) {
  const cookieStore = await cookies()
  cookieStore.delete(`admin_${params.workspace}`)
  return Response.json({ ok: true })
}
