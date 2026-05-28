'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'

export default function AdminRecoverPage() {
  const { workspace } = useParams<{ workspace: string }>()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await fetch(`/api/${workspace}/admin-recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setDone(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 360, padding: '0 24px' }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: '#2C3E6B', marginBottom: 4 }}>spacebook</div>
        <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 32 }}>Admin access recovery</div>

        {done ? (
          <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Check your email</div>
            If <strong>{email}</strong> is registered as an admin for this workspace, you'll receive your admin link shortly.
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={{ fontSize: 14, color: '#374151', marginBottom: 20, lineHeight: 1.6 }}>
              Enter your admin email address and we'll send you a link to access the admin panel.
            </div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }}
            />
            {error && <div style={{ fontSize: 13, color: '#C0392B', marginBottom: 12 }}>{error}</div>}
            <button
              type="submit"
              disabled={submitting || !email}
              style={{ width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 500, background: submitting || !email ? '#E5E7EB' : '#2C3E6B', color: submitting || !email ? '#9CA3AF' : '#ffffff', border: 'none', borderRadius: 8, cursor: submitting || !email ? 'default' : 'pointer' }}
            >
              {submitting ? 'Sending…' : 'Send admin link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
