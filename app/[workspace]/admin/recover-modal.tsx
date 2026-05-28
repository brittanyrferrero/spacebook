'use client'

import { useState } from 'react'

export default function AdminRecoverModal({ workspace }: { workspace: string }) {
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
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'sans-serif', zIndex: 50,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '32px 28px',
        width: '100%', maxWidth: 360, margin: '0 16px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
          Admin access required
        </div>

        {done ? (
          <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, margin: '16px 0 0' }}>
            If <strong>{email}</strong> is registered as an admin, your link is on its way.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 20px', lineHeight: 1.6 }}>
              Enter your email and we'll send you your admin link.
            </p>
            <form onSubmit={submit}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 14,
                  border: '1px solid #E5E7EB', borderRadius: 8,
                  marginBottom: 12, boxSizing: 'border-box', outline: 'none',
                }}
              />
              {error && <div style={{ fontSize: 13, color: '#C0392B', marginBottom: 10 }}>{error}</div>}
              <button
                type="submit"
                disabled={submitting || !email}
                style={{
                  width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 500,
                  background: submitting || !email ? '#E5E7EB' : '#2C3E6B',
                  color: submitting || !email ? '#9CA3AF' : '#fff',
                  border: 'none', borderRadius: 8,
                  cursor: submitting || !email ? 'default' : 'pointer',
                }}
              >
                {submitting ? 'Sending…' : 'Send admin link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
