import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Mock mode: open access
  if (process.env.MOCK_MODE === 'true') return <>{children}</>

  const cookieStore = await cookies()
  const adminAccess = cookieStore.get('admin_access')?.value
  if (!adminAccess) redirect('/')

  return <>{children}</>
}
