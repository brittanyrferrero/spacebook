import { cookies } from 'next/headers'
import AdminRecoverModal from './recover-modal'

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { workspace: string }
}) {
  if (process.env.MOCK_MODE === 'true') return <>{children}</>

  const cookieStore = await cookies()
  const adminAccess = cookieStore.get(`admin_${params.workspace}`)?.value
  if (!adminAccess) return <AdminRecoverModal workspace={params.workspace} />

  return <>{children}</>
}
