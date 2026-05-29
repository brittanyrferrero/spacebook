import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function PalantirLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'development') return <>{children}</>
  const cookieStore = await cookies()
  if (!cookieStore.get('palantir_session')?.value) redirect('/palantir-enter')
  return <>{children}</>
}
