import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { readPalantirSession } from '@/lib/auth-cookies'

export default async function PalantirLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'development') return <>{children}</>
  const cookieStore = await cookies()
  if (!await readPalantirSession(cookieStore)) redirect('/palantir-enter')
  return <>{children}</>
}
