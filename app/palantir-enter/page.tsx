'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function PalantirEnterForm() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const expired = searchParams.get('error') === 'expired'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    await fetch('/api/palantir/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })
    setLoading(false)
    setSubmitted(true)
  }

  return (
    <>
      {expired && (
        <div style={{ fontSize: 13, color: '#f87171', marginBottom: 20 }}>That link has expired. Request a new one.</div>
      )}

      {submitted ? (
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
          If that email is registered, a link is on its way. Check your inbox.
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', fontSize: 14, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', outline: 'none', marginBottom: 12, boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
          <button
            type="submit"
            disabled={loading || !email.trim()}
            style={{ width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 500, background: 'rgba(255,255,255,0.9)', color: '#090d18', border: 'none', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'inherit' }}>
            {loading ? 'Sending…' : 'Send link'}
          </button>
        </form>
      )}
    </>
  )
}

export default function PalantirEnterPage() {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090d18', fontFamily: 'system-ui, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;1,400&display=swap');` }} />
      <div style={{ width: '100%', maxWidth: 360, padding: '0 24px' }}>
        <div style={{ fontSize: 24, fontWeight: 500, color: '#fff', letterSpacing: '0.02em', marginBottom: 32, fontFamily: "'Spectral', Georgia, serif" }}>
          space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontFamily: 'system-ui, sans-serif', fontWeight: 400, marginLeft: 10, fontStyle: 'normal' }}>palantir</span>
        </div>
        <Suspense>
          <PalantirEnterForm />
        </Suspense>
      </div>
    </div>
  )
}
