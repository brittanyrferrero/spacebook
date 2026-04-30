'use client'

import { useState, useEffect } from 'react'

type Tab = 'desktop' | 'tablet' | 'admin'

const DARK  = '#090d18'
const DARK2 = '#0d1426'
const ROSE  = '#db95ab'
const SAGE  = '#5C7A6B'
const NAVY  = '#2C3E6B'
const OFF   = '#F6F5F2'

const STARS = [
  // Left edge cluster
  { x: '2%',  y: '10%', r: 1.5, c: '#cce8ff' }, { x: '5%',  y: '34%', r: 1,   c: '#ffd6ec' },
  { x: '3%',  y: '58%', r: 1,   c: '#e0d4ff' }, { x: '8%',  y: '80%', r: 1.5, c: '#ffffff' },
  { x: '12%', y: '22%', r: 1,   c: '#ffe8c0' }, { x: '11%', y: '70%', r: 1,   c: '#cce8ff' },
  // Right edge cluster
  { x: '88%', y: '12%', r: 1,   c: '#ffd6ec' }, { x: '92%', y: '40%', r: 1.5, c: '#e0d4ff' },
  { x: '96%', y: '65%', r: 1,   c: '#cce8ff' }, { x: '89%', y: '85%', r: 1,   c: '#ffe8c0' },
  { x: '84%', y: '28%', r: 1.5, c: '#ffffff' }, { x: '86%', y: '72%', r: 1,   c: '#ffd6ec' },
  // Top/bottom mid scatter (away from center text)
  { x: '28%', y: '5%',  r: 1,   c: '#e0d4ff' }, { x: '48%', y: '3%',  r: 1,   c: '#cce8ff' },
  { x: '68%', y: '7%',  r: 1.5, c: '#ffe8c0' }, { x: '35%', y: '93%', r: 1,   c: '#ffd6ec' },
  { x: '55%', y: '97%', r: 1,   c: '#ffffff' }, { x: '74%', y: '91%', r: 1,   c: '#e0d4ff' },
]

const TABS: { key: Tab; label: string; url: string; desc: string; fw: number; fh: number; scale: number }[] = [
  {
    key: 'desktop', label: 'Desktop', url: '/?demo=1',
    desc: 'The main booking interface — calendar view of all rooms, click any slot to book.',
    fw: 1280, fh: 780, scale: 0.72,
  },
  {
    key: 'tablet', label: 'Tablet', url: '/room/r2',
    desc: 'Mount one outside each room. Shows live status — free or in use — from across the hallway.',
    fw: 500, fh: 880, scale: 0.78,
  },
  {
    key: 'admin', label: 'Admin', url: '/demo-admin',
    desc: 'Manage rooms and bookings, view usage stats, handle cancellations.',
    fw: 1280, fh: 780, scale: 0.72,
  },
]

const PLANS = [
  {
    name: 'Nook',
    rooms: '1–2 rooms',
    price: { monthly: 30, annual: 25 },
    blurb: 'A good fit for small offices and studios just getting started.',
    features: ['Up to 2 rooms', 'Hosted & managed', 'Google Calendar sync', 'Email support', '14-day free trial'],
    cta: 'Get started',
    href: '#',
    highlight: false,
  },
  {
    name: 'Hub',
    rooms: '2–6 rooms',
    price: { monthly: 52, annual: 44 },
    blurb: 'For coworking spaces and places with a handful of bookable rooms.',
    features: ['Up to 6 rooms', 'Hosted & managed', 'Google Calendar sync', 'Email support', '14-day free trial'],
    cta: 'Get started',
    href: '#',
    highlight: false,
  },
  {
    name: 'Commons',
    rooms: '6–12 rooms',
    price: { monthly: 120, annual: 100 },
    blurb: 'For larger shared spaces that want custom branding and hands-on support.',
    features: ['Up to 12 rooms', 'Custom domain & branding', 'Google Calendar sync', 'Priority support', '14-day free trial'],
    cta: 'Get started',
    href: '#',
    highlight: false,
  },
  {
    name: 'Enterprise',
    rooms: 'Multiple locations',
    price: null,
    blurb: 'Running several sites, need a custom integration, or want us to guide you through the setup? Let\'s talk.',
    features: ['Multiple locations', 'Custom integrations', 'Dedicated support', 'Custom contract & invoicing'],
    cta: 'Contact us',
    href: 'mailto:hello@spacebook.app',
    highlight: false,
  },
]

export default function LandingPage() {
  const [tab, setTab]         = useState<Tab>('desktop')
  const [ready, setReady]     = useState(false)
  const [annual, setAnnual]   = useState(false)
  const [activeSection, setActiveSection] = useState<string>('')
  const [notifyPlan, setNotifyPlan] = useState<string | null>(null)
  const [notifyEmail, setNotifyEmail] = useState('')
  const [notifyDone, setNotifyDone] = useState(false)
  const [notifySubmitting, setNotifySubmitting] = useState(false)
  const [shootingStar, setShootingStar] = useState<{ x: number; y: number; angle: number; flip: boolean; key: number } | null>(null)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const fire = () => {
      const flip = Math.random() > 0.5
      setShootingStar({ x: Math.random() * 70 + 5, y: Math.random() * 55, angle: 15 + Math.random() * 30, flip, key: Date.now() })
      setTimeout(() => setShootingStar(null), 800)
      timeout = setTimeout(fire, 4000 + Math.random() * 3000)
    }
    timeout = setTimeout(fire, 2000 + Math.random() * 2000)
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    fetch('/api/demo-access').then(() => setReady(true))
  }, [])

  useEffect(() => {
    const ids = ['features', 'demo', 'pricing']
    const observers = ids.map(id => {
      const el = document.getElementById(id)
      if (!el) return null
      const obs = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) setActiveSection(id)
      }, { rootMargin: '-40% 0px -40% 0px', threshold: 0 })
      obs.observe(el)
      return obs
    })
    return () => observers.forEach(o => o?.disconnect())
  }, [])

  const cur = TABS.find(t => t.key === tab)!
  const cw = tab === 'tablet' ? Math.round(cur.fw * cur.scale) : 920
  const ch = Math.round(cur.fh * cur.scale)

  const urlLabel = tab === 'tablet' ? 'yourspace.com/room/cedar' : tab === 'admin' ? 'yourspace.com/admin' : 'yourspace.com'

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1a1a1a', overflowX: 'hidden' }}>
      <style>{`
        html { scroll-behavior: smooth }
        @keyframes shoot {
          0%   { transform: translateX(0); opacity: 0; }
          15%  { opacity: 0.85; }
          100% { transform: translateX(220px); opacity: 0; }
        }
      `}</style>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div style={{ background: DARK, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {STARS.map((s, i) => (
          <div key={i} style={{ position: 'absolute', left: s.x, top: s.y, width: s.r * 2, height: s.r * 2, borderRadius: '50%', background: s.c, opacity: 0.2 + (i % 3) * 0.1, boxShadow: `0 0 ${s.r * 3}px ${s.r}px ${s.c}33`, pointerEvents: 'none' }} />
        ))}

        {/* Shooting star */}
        {shootingStar && (
          <div key={shootingStar.key} style={{ position: 'absolute', left: `${shootingStar.x}%`, top: `${shootingStar.y}%`, transform: `rotate(${shootingStar.angle}deg) scaleX(${shootingStar.flip ? -1 : 1})`, transformOrigin: 'left center', pointerEvents: 'none' }}>
            <div style={{ width: 90, height: 1.5, borderRadius: 2, background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.75) 100%)', animation: 'shoot 0.8s ease-out forwards' }} />
          </div>
        )}

        {/* Soft glow */}
        <div style={{ position: 'absolute', left: '50%', top: '60%', transform: 'translate(-50%,-50%)', width: 600, height: 400, background: `radial-gradient(ellipse, ${ROSE}18 0%, transparent 70%)`, pointerEvents: 'none' }} />

        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 44px', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
            space<span style={{ color: ROSE, fontWeight: 300 }}>book</span>
          </div>
          <a href="#pricing" style={{ fontSize: 13, padding: '8px 20px', borderRadius: 20, background: ROSE, color: '#fff', textDecoration: 'none', fontWeight: 500, letterSpacing: '0.01em' }}>
            Get started
          </a>
        </nav>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '80px 24px 100px', position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontSize: 'clamp(38px, 6.5vw, 76px)', fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.04, margin: '0 0 24px', maxWidth: 780 }}>
            Book space.
          </h1>
          {/* Audience */}
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.72)', lineHeight: 1.75, maxWidth: 620, margin: '24px 0 56px' }}>
            For coworking spaces, offices, studios, maker spaces, and anywhere else people share rooms and need a simple way to book them.
          </p>

          <div style={{ display: 'flex', gap: 10 }}>
            {([['#features','1. Features'],['#demo','2. Demo'],['#pricing','3. Pricing']] as const).map(([href, label]) => (
              <a key={href} href={href} style={{ fontSize: 13, padding: '9px 22px', borderRadius: 20, border: `1px solid ${ROSE}`, color: ROSE, textDecoration: 'none', background: 'rgba(219,149,171,0.1)', fontWeight: 500 }}>{label}</a>
            ))}
          </div>

        </div>
      </div>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <div id="features" style={{ background: '#E8F4EC', padding: '80px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 40 }}>
          {[
            { title: 'Frictionless access', body: 'No app to download, and no confusing onboarding.' },
            { title: 'Recurring bookings', body: 'Set it once and it repeats until you say otherwise.' },
            { title: 'Your data', body: 'Self-host it, or let us run it. Either way, nothing is sold or shared.' },
            { title: 'Google Calendar', body: 'Add a room when you\'re scheduling your meeting and easily view potential conflicts.' },
            { title: 'Built to fit', body: 'Customizable to your team and space\'s needs.' },
            { title: 'Any tablet', body: 'Mount any iPad or Android tablet outside the door. No proprietary hardware, no extra cost.' },
          ].map(f => (
            <div key={f.title} style={{ background: '#fff', borderRadius: 14, padding: '24px 22px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ width: 24, height: 2, background: ROSE, borderRadius: 2, marginBottom: 14 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#2C3E6B', marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: '#4a5a7a', lineHeight: 1.65 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Demo ─────────────────────────────────────────────────────── */}
      <div id="demo" style={{ background: DARK2, padding: '90px 24px' }}>
        <div style={{ maxWidth: 1020, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: ROSE, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Live demo</div>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 12px' }}>
              Try it yourself
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.62)', margin: '0 0 28px' }}>
              This is the real app, running with sample data.
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.48)', margin: 0 }}>
              Toggle between the desktop view, tablet version, and admin panel below.
            </p>
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 32 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ fontSize: 13, padding: '8px 22px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s, color .15s',
                  background: tab === t.key ? ROSE : 'rgba(255,255,255,0.07)',
                  color: tab === t.key ? '#fff' : 'rgba(255,255,255,0.45)',
                  fontWeight: tab === t.key ? 500 : 400,
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Demo frame */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
            <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.09)', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.7)', background: '#1e2332' }}>
              {/* Browser chrome */}
              <div style={{ background: '#242b3a', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  {['#FF5F57', '#FFBD2E', '#28C840'].map(c => (
                    <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.6 }} />
                  ))}
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 6, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: 320, margin: '0 auto' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.01em' }}>{urlLabel}</span>
                </div>
              </div>

              {/* Iframe container */}
              <div style={{ width: cw, height: ch, overflow: 'hidden', position: 'relative' }}>
                {ready ? (
                  <iframe
                    key={tab}
                    src={cur.url}
                    style={{ width: cur.fw, height: cur.fh, border: 'none', transform: `scale(${cur.scale})`, transformOrigin: 'top left', display: 'block' }}
                    title={`spacebook ${cur.label} view`}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090d18' }}>
                    <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>Loading…</div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <div id="pricing" style={{ background: OFF, padding: '90px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 700, color: NAVY, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
              Plan options
            </h2>
            <p style={{ fontSize: 15, color: '#6B7280', margin: '0 0 28px' }}>
              No per-seat fees. No surprise limits.
            </p>

            {/* Annual toggle */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span style={{ color: annual ? '#9CA3AF' : NAVY, fontWeight: annual ? 400 : 500 }}>Monthly</span>
              <div onClick={() => setAnnual(a => !a)}
                style={{ width: 40, height: 23, borderRadius: 12, background: annual ? SAGE : '#D1D5DB', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', width: 17, height: 17, borderRadius: '50%', background: '#fff', top: 3, left: annual ? 20 : 3, transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
              </div>
              <span style={{ color: annual ? NAVY : '#9CA3AF', fontWeight: annual ? 500 : 400 }}>
                Annual{' '}
                <span style={{ color: SAGE, fontSize: 11, fontWeight: 600 }}>save 2 months</span>
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, alignItems: 'start' }}>
            {PLANS.map(p => {
              const price = p.price ? p.price[annual ? 'annual' : 'monthly'] : null
              return (
                <div key={p.name} style={{
                  background: NAVY,
                  borderRadius: 16,
                  padding: '30px 28px',
                  position: 'relative',
                }}>

                  <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {p.name}
                  </div>

                  <div style={{ fontSize: 17, fontWeight: 500, color: '#fff', marginBottom: 14 }}>
                    {p.rooms}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 16 }}>
                    {price === null ? (
                      <span style={{ fontSize: 28, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>Let's talk</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 34, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1 }}>${price}</span>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>/mo</span>
                      </>
                    )}
                  </div>

                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.55, margin: '0 0 22px', minHeight: 52 }}>
                    {p.blurb}
                  </p>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 26px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {p.features.map(f => (
                      <li key={f} style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'flex-start', gap: 9, lineHeight: 1.4 }}>
                        <span style={{ color: ROSE, flexShrink: 0, fontWeight: 600, fontSize: 12, marginTop: 1 }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <a
                    href={p.cta === 'Get started' ? undefined : p.href}
                    onClick={p.cta === 'Get started' ? (e) => { e.preventDefault(); setNotifyPlan(p.name); setNotifyDone(false); setNotifyEmail('') } : undefined}
                    style={{
                      display: 'block', textAlign: 'center', padding: '11px 0', borderRadius: 9, fontSize: 13, fontWeight: 500, textDecoration: 'none', cursor: 'pointer', transition: 'opacity .15s',
                      background: ROSE,
                      color: '#fff',
                      border: 'none',
                    }}>
                    {p.cta}
                  </a>
                </div>
              )
            })}
          </div>

          <p style={{ textAlign: 'center', fontSize: 13, color: '#9CA3AF', marginTop: 36, lineHeight: 1.6 }}>
            Hosted plans include a 14-day free trial — no credit card required.<br />
            Annual plans are billed once per year, and we'll send you a reminder.
          </p>
        </div>
      </div>

      {/* ── Notify modal ─────────────────────────────────────────────── */}
      {notifyPlan !== null && (
        <div onClick={() => setNotifyPlan(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: DARK, borderRadius: 16, padding: 36, maxWidth: 420, width: '100%', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', position: 'relative' }}>
            <button onClick={() => setNotifyPlan(null)} style={{ position: 'absolute', top: 16, right: 18, background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
            {!notifyDone ? (
              <>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', marginBottom: 8 }}>
                  space<span style={{ color: ROSE, fontWeight: 300 }}>book</span>
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65, margin: '0 0 24px' }}>
                  Leave your email and we'll send you a message when we're ready for sign-ups. No spam, no list, just that one note.
                </p>
                <form onSubmit={async e => {
                  e.preventDefault()
                  setNotifySubmitting(true)
                  await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: notifyEmail, plan: notifyPlan }) })
                  setNotifySubmitting(false)
                  setNotifyDone(true)
                }} style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="email" required placeholder="you@example.com" value={notifyEmail} onChange={e => setNotifyEmail(e.target.value)}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button type="submit" disabled={notifySubmitting}
                    style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: ROSE, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: notifySubmitting ? 0.7 : 1 }}>
                    {notifySubmitting ? '…' : 'Notify me'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', marginBottom: 12 }}>
                  space<span style={{ color: ROSE, fontWeight: 300 }}>book</span>
                </div>
                <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', fontWeight: 500, margin: '0 0 8px' }}>You're on the list.</p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, margin: 0 }}>
                  We'll email you when we're ready. Talk soon.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Back to top ──────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 50 }}>
        {([['#features','features','1'],['#demo','demo','2'],['#pricing','pricing','3']] as const).map(([href, id, n]) => {
          const active = activeSection === id
          return (
            <a key={href} href={href} style={{ width: 28, height: 28, borderRadius: '50%', background: active ? ROSE : 'rgba(219,149,171,0.15)', border: `1px solid ${ROSE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: active ? '#fff' : ROSE, fontSize: 11, fontWeight: 600, transition: 'background .3s, color .3s' }}>{n}</a>
          )
        })}
        <a href="#" aria-label="Back to top"
          style={{ width: 36, height: 36, borderRadius: '50%', background: 'transparent', border: `1px solid ${ROSE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
          <span style={{ color: ROSE, fontSize: 16, lineHeight: 1, marginTop: -2 }}>↑</span>
        </a>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div style={{ background: DARK, padding: '36px 44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
          space<span style={{ color: ROSE, fontWeight: 300 }}>book</span>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', maxWidth: 340, textAlign: 'right' }}>
          Made for small teams who just needed to book a room
        </div>
      </div>

    </div>
  )
}
