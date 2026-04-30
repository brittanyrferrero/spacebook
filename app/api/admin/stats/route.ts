import { type NextRequest } from 'next/server'
import { subDays, format } from 'date-fns'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const to = searchParams.get('to') ?? format(new Date(), 'yyyy-MM-dd')
  const from = searchParams.get('from') ?? format(subDays(new Date(), 29), 'yyyy-MM-dd')

  if (process.env.MOCK_MODE === 'true') {
    const [{ getAdminStats }, { getSessionStore }] = await Promise.all([import('@/lib/mock/api'), import('@/lib/mock/store')])
    const roomId = searchParams.get('room_id') ?? undefined
    return Response.json(getAdminStats(await getSessionStore(), from, to, roomId))
  }

  return Response.json({ error: 'Not implemented' }, { status: 501 })
}
