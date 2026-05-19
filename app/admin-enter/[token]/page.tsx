'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

export default function AdminEnterPage() {
  const { token } = useParams<{ token: string }>()
  const [unclaimed, setUnclaimed] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin-enter').then(r => r.json()).then(({ unclaimed }) => {
      if (!unclaimed) {
        // Try auto-verify from localStorage
        try {
          const saved = localStorage.getItem('spacebook_user')
          if (saved) {
            const savedEmail = JSON.parse(saved).email ?? ''
            if (savedEmail) {
              verify(savedEmail)
              return
            }
          }
        } catch {}
      }
      setUnclaimed(unclaimed)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function verify(emailToVerify: string) {
    const res = await fetch('/api/admin-enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailToVerify, token }),
    })
    if (res.ok) {
      window.location.href = '/admin'
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Access denied.')
      setUnclaimed(false)
      setSubmitting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    await verify(email)
  }

  const bg = '#090d18'
  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 0,
    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)',
    color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  const wrap: React.CSSProperties = {
    height: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: bg, fontFamily: 'system-ui, sans-serif',
  }

  if (unclaimed === null) {
    return <div style={wrap}><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Verifying…</div></div>
  }

  const title = unclaimed ? 'Claim admin access' : 'Admin access'
  const subtitle = unclaimed
    ? 'You\'re the first admin for this workspace. Enter your email to claim super admin access.'
    : 'Enter your email to verify admin access.'

  return (
    <div style={wrap}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;1,400&display=swap');` }} />
      <div style={{ width: '100%', maxWidth: 340, padding: '0 24px' }}>
        <div style={{ fontSize: 22, fontWeight: 500, color: '#fff', letterSpacing: '0.02em', textAlign: 'center', marginBottom: 8, fontFamily: "'Spectral', Georgia, serif" }}>
          space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', textAlign: 'center', marginBottom: 6 }}>{title}</div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', margin: '0 0 24px' }}>{subtitle}</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            style={inp}
            type="email"
            placeholder="Your email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
          {error && <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{error}</p>}
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            style={{ marginTop: 4, padding: '11px 0', borderRadius: 0, border: 'none', background: '#db95ab', color: '#fff', fontSize: 14, fontWeight: 500, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: 'inherit' }}>
            {submitting ? 'Verifying…' : unclaimed ? 'Claim access' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
