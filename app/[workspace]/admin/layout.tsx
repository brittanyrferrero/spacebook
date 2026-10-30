import { cookies } from 'next/headers'
import AdminRecoverModal from './recover-modal'

export default async function AdminLayout(
  props: {
    children: React.ReactNode
    params: Promise<{ workspace: string }>
  }
) {
  const params = await props.params;

  const {
    children
  } = props;

  if (process.env.MOCK_MODE === 'true') return <>{children}</>

  const cookieStore = await cookies()
  const adminAccess = cookieStore.get(`admin_${params.workspace}`)?.value
  if (!adminAccess) return <AdminRecoverModal workspace={params.workspace} />

  return <>{children}</>
}
