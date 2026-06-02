import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(_req: NextRequest, { params }: { params: { workspace: string } }) {
  const cookieStore = await cookies()
  const email = cookieStore.get(`mb_${params.workspace}`)?.value ?? null
  return Response.json({ email })
}
