import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const SAGE = '#5C7A6B'
const NAVY = '#2C3E6B'

async function login(formData: FormData) {
  'use server'
  const password = formData.get('password') as string
  if (password === process.env.ADMIN_PASSWORD) {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    cookieStore.set('admin_auth', 'true', { httpOnly: true, sameSite: 'strict', path: '/' })
    redirect('/admin')
  }
  redirect('/admin?error=1')
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const authed = cookieStore.get('admin_auth')?.value === 'true'

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8F8F6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', border: '0.5px solid #E0E4E8', borderRadius: 14, padding: 32, maxWidth: 360, width: '100%' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: NAVY, marginBottom: 2 }}>
            space<span style={{ color: SAGE, fontWeight: 400 }}>book</span>{' '}
            <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 400 }}>admin</span>
          </div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20, marginTop: 6 }}>Enter your admin password to continue.</div>
          <form action={login}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 500, display: 'block', marginBottom: 4 }}>Password</label>
              <input name="password" type="password" autoFocus
                style={{ fontSize: 13, padding: '8px 10px', border: '0.5px solid #C8CDD4', borderRadius: 8, outline: 'none', width: '100%', fontFamily: 'inherit' }} />
            </div>
            <button type="submit" style={{ width: '100%', background: SAGE, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              Sign in
            </button>
          </form>
          <div style={{ marginTop: 10, fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>
            (Hint: in mock mode, password is <code>admin</code>)
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
