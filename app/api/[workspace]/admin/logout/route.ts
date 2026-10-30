import { cookies } from 'next/headers'

export async function POST(_req: Request, props: { params: Promise<{ workspace: string }> }) {
  const params = await props.params;
  const cookieStore = await cookies()
  cookieStore.delete(`admin_${params.workspace}`)
  return Response.json({ ok: true })
}
