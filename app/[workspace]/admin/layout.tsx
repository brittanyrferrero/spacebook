import { cookies } from 'next/headers'
import AdminRecoverModal from './recover-modal'
import { readAdminRole } from '@/lib/auth-cookies'

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { workspace: string }
}) {
  if (process.env.MOCK_MODE === 'true') return <>{children}</>

  const cookieStore = await cookies()
  const adminAccess = await readAdminRole(cookieStore, params.workspace)
  if (!adminAccess) return <AdminRecoverModal workspace={params.workspace} />

  return <>{children}</>
}
