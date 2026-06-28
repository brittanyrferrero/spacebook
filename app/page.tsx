'use client'
import { useState } from 'react'

export default function RootPage() {
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    try {
      const res = await fetch('/api/find-my-workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setStatus(res.ok ? 'done' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#090d18', fontFamily: 'system-ui, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;1,400&display=swap');` }} />
      <div style={{ width: '100%', maxWidth: 400, padding: '0 24px', textAlign: 'center' }}>

        <div style={{ fontSize: 28, fontWeight: 500, color: '#fff', letterSpacing: '0.02em', marginBottom: 32, fontFamily: "'Spectral', Georgia, serif" }}>
          space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
        </div>

        {status === 'done' ? (
          <>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.85)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Check your inbox.
            </p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.6 }}>
              We&apos;ve sent your workspace links to {email}.
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.85)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Find your workspaces.
            </p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: '0 0 28px', lineHeight: 1.6 }}>
              Enter your email to get links to every Spacebook instance you&apos;re connected to.
            </p>
            <form onSubmit={handleSubmit}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={{
                  width: '100%', padding: '12px 16px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8, color: '#fff',
                  fontSize: 15, outline: 'none',
                  marginBottom: 10, boxSizing: 'border-box',
                }}
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                style={{
                  width: '100%', padding: '12px 0',
                  background: status === 'loading' ? 'rgba(255,255,255,0.5)' : '#fff',
                  color: '#090d18', border: 'none',
                  borderRadius: 8, fontSize: 15,
                  fontWeight: 500, cursor: status === 'loading' ? 'default' : 'pointer',
                }}
              >
                {status === 'loading' ? 'Sending…' : 'Send me my links'}
              </button>
              {status === 'error' && (
                <p style={{ fontSize: 13, color: 'rgba(255,100,100,0.8)', marginTop: 12, margin: '12px 0 0' }}>
                  Something went wrong — please try again.
                </p>
              )}
            </form>
          </>
        )}

      </div>
    </div>
  )
}
