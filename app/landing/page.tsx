'use client'

import { useState, useEffect } from 'react'

type Tab = 'desktop' | 'tablet' | 'admin'

const CREAM  = '#f2e8d0'
const CREAM2 = '#e8d9b8'
const INK    = '#1c1510'

const TABS: { key: Tab; label: string; url: string; fw: number; fh: number; scale: number }[] = [
  { key: 'desktop', label: 'Desktop',  url: '/?demo=1',    fw: 1280, fh: 780, scale: 0.72 },
  { key: 'tablet',  label: 'Tablet',   url: '/room/r2',    fw: 500,  fh: 880, scale: 0.78 },
  { key: 'admin',   label: 'Admin',    url: '/demo-admin', fw: 1280, fh: 780, scale: 0.72 },
]

const PLANS = [
  { name: 'Nook',       rooms: '1–2 rooms',          price: { monthly: 30,  annual: 25  }, blurb: 'A good fit for small offices and studios just getting started.',                                                       features: ['Up to 2 rooms', 'Hosted & managed', 'Google Calendar sync', 'Email support', '14-day free trial'],                 cta: 'Get started', href: '#' },
  { name: 'Hub',        rooms: '2–6 rooms',           price: { monthly: 52,  annual: 44  }, blurb: 'For coworking spaces and places with a handful of bookable rooms.',                                                    features: ['Up to 6 rooms', 'Hosted & managed', 'Google Calendar sync', 'Email support', '14-day free trial'],                 cta: 'Get started', href: '#' },
  { name: 'Commons',    rooms: '6–12 rooms',          price: { monthly: 120, annual: 100 }, blurb: 'For larger shared spaces that want custom branding and hands-on support.',                                             features: ['Up to 12 rooms', 'Custom domain & branding', 'Google Calendar sync', 'Priority support', '14-day free trial'],     cta: 'Get started', href: '#' },
  { name: 'Enterprise', rooms: 'Multiple locations',  price: null,                          blurb: "Running several sites, need a custom integration, or want us to guide you through the setup? Let's talk.",            features: ['Multiple locations', 'Custom integrations', 'Dedicated support', 'Custom contract & invoicing'],                  cta: 'Contact us', href: 'mailto:hello@spacebook.app' },
]

const FEATURES = [
  { title: 'Frictionless access',   body: 'No app to download, and no confusing onboarding.',                                                       icon: 'M12 2 L14 8 L20 8 L15 12 L17 18 L12 14 L7 18 L9 12 L4 8 L10 8 Z' },
  { title: 'Recurring bookings',    body: 'Set it once and it repeats until you say otherwise.',                                                     icon: 'M4 12 A8 8 0 0 1 20 12 M20 12 L17 9 M20 12 L17 15' },
  { title: 'Your data',             body: 'Self-host it, or let us run it. Either way, nothing is sold or shared.',                                  icon: 'M12 2 L2 7 L12 12 L22 7 Z M2 17 L12 22 L22 17 M2 12 L12 17 L22 12' },
  { title: 'Google Calendar',       body: 'Add a room when you\'re scheduling your meeting and easily view potential conflicts.',                     icon: 'M5 4 H19 A1 1 0 0 1 20 5 V19 A1 1 0 0 1 19 20 H5 A1 1 0 0 1 4 19 V5 A1 1 0 0 1 5 4 Z M4 9 H20 M9 4 V9' },
  { title: 'Built to fit',          body: 'Customizable to your team and space\'s needs.',                                                           icon: 'M12 2 L12 6 M12 18 L12 22 M4.93 4.93 L7.76 7.76 M16.24 16.24 L19.07 19.07 M2 12 L6 12 M18 12 L22 12 M4.93 19.07 L7.76 16.24 M16.24 7.76 L19.07 4.93' },
  { title: 'Any tablet',            body: 'Mount any iPad or Android tablet outside the door. No proprietary hardware, no extra cost.',              icon: 'M8 2 H16 A2 2 0 0 1 18 4 V20 A2 2 0 0 1 16 22 H8 A2 2 0 0 1 6 20 V4 A2 2 0 0 1 8 2 Z M12 18 L12 18.5' },
]

// Starburst SVG for hero
function Starburst() {
  const cx = 150, cy = 150
  const rays = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI * 2) / 24
    const isPrimary = i % 2 === 0
    const r1 = 82, r2 = isPrimary ? 140 : 118
    const sw = isPrimary ? 2.5 : 1.2
    return <line key={i} x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1} x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2} stroke={CREAM} strokeWidth={sw} />
  })
  return (
    <svg viewBox="0 0 300 300" width={280} height={280} style={{ display: 'block' }}>
      {rays}
      <circle cx={cx} cy={cy} r={80} fill={CREAM} />
      <circle cx={cx} cy={cy} r={70} fill={INK} />
      <circle cx={cx} cy={cy} r={56} fill={CREAM} />
      <circle cx={cx} cy={cy} r={44} fill={INK} />
      <circle cx={cx} cy={cy} r={30} fill={CREAM} />
      {/* eye motif */}
      <ellipse cx={cx} cy={cy} rx={16} ry={8} fill={INK} />
      <circle cx={cx} cy={cy} r={4} fill={CREAM} />
      <circle cx={cx} cy={cy} r={1.5} fill={INK} />
      {/* corner dots */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI * 2) / 8 + Math.PI / 8
        const r = 92
        return <circle key={i} cx={cx + Math.cos(a) * r} cy={cy + Math.sin(a) * r} r={2} fill={CREAM} />
      })}
    </svg>
  )
}

// Small 4-pointed star
function Star4({ size = 8, color = CREAM }: { size?: number; color?: string }) {
  const s = size, t = s * 0.25
  return (
    <svg width={s * 2} height={s * 2} viewBox={`-${s} -${s} ${s * 2} ${s * 2}`} style={{ display: 'inline-block' }}>
      <path d={`M0,-${s} L${t},-${t} L${s},0 L${t},${t} L0,${s} L-${t},${t} L-${s},0 L-${t},-${t}Z`} fill={color} />
    </svg>
  )
}

// Ornamental divider
function Divider({ color = INK }: { color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 auto', maxWidth: 480 }}>
      <div style={{ flex: 1, height: 1, background: color, opacity: 0.4 }} />
      <Star4 size={6} color={color} />
      <div style={{ flex: 1, height: 1, background: color, opacity: 0.4 }} />
    </div>
  )
}

export default function LandingPage() {
  const [tab, setTab]           = useState<Tab>('desktop')
  const [ready, setReady]       = useState(false)
  const [annual, setAnnual]     = useState(false)
  const [activeSection, setActiveSection] = useState<string>('')
  const [notifyPlan, setNotifyPlan]       = useState<string | null>(null)
  const [notifyEmail, setNotifyEmail]     = useState('')
  const [notifyDone, setNotifyDone]       = useState(false)
  const [notifySubmitting, setNotifySubmitting] = useState(false)
  const [shootingStar, setShootingStar]   = useState<{ x: number; y: number; angle: number; flip: boolean; key: number } | null>(null)

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
    <div style={{ fontFamily: "'Crimson Text', Georgia, 'Times New Roman', serif", color: INK, overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
        html { scroll-behavior: smooth }
        @keyframes shoot {
          0%   { transform: translateX(0); opacity: 0; }
          15%  { opacity: 0.6; }
          100% { transform: translateX(220px); opacity: 0; }
        }
        @keyframes flicker {
          0%, 100% { opacity: 1; } 50% { opacity: 0.85; }
        }
      `}</style>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div style={{ background: INK, position: 'relative', overflow: 'hidden', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

        {/* Grain overlay */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(${CREAM}08 1px, transparent 1px)`, backgroundSize: '24px 24px', pointerEvents: 'none' }} />

        {/* Scattered stars */}
        {[
          { x: '6%',  y: '12%', s: 5 }, { x: '91%', y: '8%',  s: 7 }, { x: '3%',  y: '72%', s: 4 },
          { x: '95%', y: '65%', s: 5 }, { x: '88%', y: '88%', s: 4 }, { x: '12%', y: '88%', s: 6 },
          { x: '48%', y: '4%',  s: 4 }, { x: '75%', y: '18%', s: 5 }, { x: '22%', y: '55%', s: 4 },
          { x: '82%', y: '45%', s: 4 }, { x: '35%', y: '92%', s: 5 }, { x: '65%', y: '88%', s: 4 },
        ].map((st, i) => (
          <div key={i} style={{ position: 'absolute', left: st.x, top: st.y, opacity: 0.35 + (i % 3) * 0.15, pointerEvents: 'none' }}>
            <Star4 size={st.s} color={CREAM} />
          </div>
        ))}

        {/* Shooting star */}
        {shootingStar && (
          <div key={shootingStar.key} style={{ position: 'absolute', left: `${shootingStar.x}%`, top: `${shootingStar.y}%`, transform: `rotate(${shootingStar.angle}deg) scaleX(${shootingStar.flip ? -1 : 1})`, transformOrigin: 'left center', pointerEvents: 'none' }}>
            <div style={{ width: 90, height: 1.5, borderRadius: 1, background: `linear-gradient(90deg, ${CREAM}00 0%, ${CREAM}88 100%)`, animation: 'shoot 0.8s ease-out forwards' }} />
          </div>
        )}

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 44px', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, fontWeight: 700, color: CREAM, letterSpacing: '0.04em' }}>
            space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
          </div>
          <a href="#pricing" style={{ padding: '8px 22px', border: `1.5px solid ${CREAM}`, color: CREAM, textDecoration: 'none', fontFamily: "'Crimson Text', serif", letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}>
            Get started
          </a>
        </nav>

        {/* Hero content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px 80px', position: 'relative', zIndex: 1, gap: 0 }}>

          <div style={{ marginBottom: 32 }}>
            <Starburst />
          </div>

          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(52px, 8vw, 96px)', fontWeight: 900, color: CREAM, letterSpacing: '-0.02em', lineHeight: 1, margin: '0 0 20px' }}>
            Book space.
          </h1>

          <p style={{ fontSize: 'clamp(15px, 1.8vw, 18px)', color: `${CREAM}99`, lineHeight: 1.7, maxWidth: 560, margin: '0 0 48px', fontStyle: 'italic' }}>
            For coworking spaces, offices, studios, maker spaces, and anywhere else people share rooms and need a simple way to book them.
          </p>

          {/* Section nav */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {([['#features', '1. Features'], ['#demo', '2. Demo'], ['#pricing', '3. Pricing']] as const).map(([href, label]) => (
              <a key={href} href={href} style={{ fontSize: 11, padding: '8px 20px', border: `1px solid ${CREAM}55`, color: `${CREAM}bb`, textDecoration: 'none', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Crimson Text', serif" }}>
                {label}
              </a>
            ))}
          </div>
        </div>

        {/* Bottom border */}
        <div style={{ height: 4, background: CREAM, opacity: 0.15 }} />
      </div>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <div id="features" style={{ background: CREAM, padding: '80px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: `${INK}66`, marginBottom: 16 }}>— i —</div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700, color: INK, letterSpacing: '-0.01em', margin: '0 0 20px' }}>
              What it does
            </h2>
            <Divider />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 0 }}>
            {FEATURES.map((f, i) => (
              <div key={f.title} style={{ padding: '32px 28px', border: `1.5px solid ${INK}`, marginLeft: i % 3 === 0 ? 0 : -1.5, marginTop: i >= 3 ? -1.5 : 0, background: CREAM, position: 'relative' }}>
                <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16, display: 'block' }}>
                  <path d={f.icon} />
                </svg>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 15, fontWeight: 700, color: INK, marginBottom: 10, letterSpacing: '0.01em' }}>{f.title}</div>
                <div style={{ fontSize: 14, color: `${INK}99`, lineHeight: 1.65, fontStyle: 'italic' }}>{f.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Demo ─────────────────────────────────────────────────────── */}
      <div id="demo" style={{ background: INK, padding: '90px 24px', borderTop: `4px solid ${CREAM}22`, borderBottom: `4px solid ${CREAM}22` }}>
        <div style={{ maxWidth: 1020, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: `${CREAM}55`, marginBottom: 16 }}>— ii —</div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700, color: CREAM, letterSpacing: '-0.01em', margin: '0 0 16px' }}>
              Try it yourself
            </h2>
            <p style={{ fontSize: 16, color: `${CREAM}99`, margin: '0 0 28px', fontStyle: 'italic' }}>
              This is the real app, running with sample data.
            </p>
            <p style={{ fontSize: 13, color: `${CREAM}66`, margin: 0 }}>
              Toggle between the desktop view, tablet version, and admin panel below.
            </p>
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 0, marginBottom: 32, border: `1.5px solid ${CREAM}44` }}>
            {TABS.map((t, i) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex: 1, maxWidth: 160, fontSize: 12, padding: '10px 0', border: 'none', borderRight: i < TABS.length - 1 ? `1px solid ${CREAM}33` : 'none', cursor: 'pointer', fontFamily: "'Crimson Text', serif", letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'background .15s, color .15s',
                  background: tab === t.key ? CREAM : 'transparent',
                  color: tab === t.key ? INK : `${CREAM}66`,
                  fontWeight: tab === t.key ? 600 : 400,
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Demo frame */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ border: `2px solid ${CREAM}33`, overflow: 'hidden', background: '#1e2332' }}>
              {/* Browser chrome */}
              <div style={{ background: '#1a2030', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${CREAM}15` }}>
                <div style={{ display: 'flex', gap: 5 }}>
                  {['#FF5F57', '#FFBD2E', '#28C840'].map(c => (
                    <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.5 }} />
                  ))}
                </div>
                <div style={{ flex: 1, background: `${CREAM}08`, border: `1px solid ${CREAM}15`, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: 320, margin: '0 auto' }}>
                  <span style={{ fontSize: 11, color: `${CREAM}33`, fontFamily: 'monospace' }}>{urlLabel}</span>
                </div>
              </div>
              <div style={{ width: cw, height: ch, overflow: 'hidden', position: 'relative' }}>
                {ready ? (
                  <iframe key={tab} src={cur.url} style={{ width: cur.fw, height: cur.fh, border: 'none', transform: `scale(${cur.scale})`, transformOrigin: 'top left', display: 'block' }} title={`spacebook ${cur.label} view`} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090d18' }}>
                    <div style={{ color: `${CREAM}44`, fontSize: 13, fontStyle: 'italic' }}>Loading…</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <div id="pricing" style={{ background: CREAM2, padding: '90px 24px' }}>
        <div style={{ maxWidth: 940, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: `${INK}55`, marginBottom: 16 }}>— iii —</div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700, color: INK, letterSpacing: '-0.01em', margin: '0 0 12px' }}>
              Plan options
            </h2>
            <p style={{ fontSize: 16, color: `${INK}77`, margin: '0 0 32px', fontStyle: 'italic' }}>No per-seat fees. No surprise limits.</p>
            <Divider />
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 13, marginTop: 28 }}>
              <span style={{ color: annual ? `${INK}55` : INK, fontWeight: annual ? 400 : 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 11 }}>Monthly</span>
              <div onClick={() => setAnnual(a => !a)} style={{ width: 42, height: 24, border: `1.5px solid ${INK}`, position: 'relative', cursor: 'pointer', background: 'transparent', flexShrink: 0 }}>
                <div style={{ position: 'absolute', width: 16, height: 16, background: INK, top: 3, left: annual ? 21 : 3, transition: 'left .2s' }} />
              </div>
              <span style={{ color: annual ? INK : `${INK}55`, fontWeight: annual ? 600 : 400, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 11 }}>
                Annual <span style={{ color: INK, fontStyle: 'italic', textTransform: 'none', fontSize: 12 }}>— save 2 months</span>
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 0 }}>
            {PLANS.map((p, i) => {
              const price = p.price ? p.price[annual ? 'annual' : 'monthly'] : null
              return (
                <div key={p.name} style={{ background: CREAM, border: `1.5px solid ${INK}`, marginLeft: i === 0 ? 0 : -1.5, padding: '32px 28px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: `${INK}66`, marginBottom: 12 }}>{p.name}</div>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 17, fontWeight: 700, color: INK, marginBottom: 20 }}>{p.rooms}</div>
                  <div style={{ marginBottom: 20 }}>
                    {price === null ? (
                      <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 26, fontWeight: 700, color: INK }}>Let's talk</span>
                    ) : (
                      <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, fontWeight: 900, color: INK, letterSpacing: '-0.02em' }}>
                        ${price}<span style={{ fontSize: 13, fontWeight: 400, fontStyle: 'italic', color: `${INK}66` }}>/mo</span>
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 14, color: `${INK}88`, lineHeight: 1.6, margin: '0 0 20px', fontStyle: 'italic', flex: 1 }}>{p.blurb}</p>
                  <div style={{ height: 1, background: `${INK}22`, marginBottom: 20 }} />
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {p.features.map(f => (
                      <li key={f} style={{ fontSize: 13, color: INK, display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.4 }}>
                        <Star4 size={5} color={INK} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a href={p.cta === 'Get started' ? undefined : p.href}
                    onClick={p.cta === 'Get started' ? (e) => { e.preventDefault(); setNotifyPlan(p.name); setNotifyDone(false); setNotifyEmail('') } : undefined}
                    style={{ display: 'block', textAlign: 'center', padding: '11px 0', border: `1.5px solid ${INK}`, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none', cursor: 'pointer', color: INK, background: 'transparent', fontFamily: "'Crimson Text', serif", transition: 'background .15s, color .15s' }}>
                    {p.cta}
                  </a>
                </div>
              )
            })}
          </div>

          <p style={{ textAlign: 'center', fontSize: 14, color: `${INK}66`, marginTop: 36, lineHeight: 1.7, fontStyle: 'italic' }}>
            Hosted plans include a 14-day free trial — no credit card required.<br />
            Annual plans are billed once per year, and we'll send you a reminder.
          </p>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div style={{ background: INK, padding: '40px 44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 16, fontWeight: 700, color: CREAM, letterSpacing: '0.04em' }}>
          space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <a href="mailto:hello@spacebook.app" style={{ fontSize: 12, color: `${CREAM}66`, textDecoration: 'none', letterSpacing: '0.06em' }}>hello@spacebook.app</a>
          <Star4 size={5} color={`${CREAM}44`} />
          <span style={{ fontSize: 12, color: `${CREAM}44`, letterSpacing: '0.06em' }}>© {new Date().getFullYear()} spacebook</span>
        </div>
      </div>

      {/* ── Fixed nav bubbles ─────────────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 50 }}>
        {([['#features', 'features', '1'], ['#demo', 'demo', '2'], ['#pricing', 'pricing', '3']] as const).map(([href, id, n]) => {
          const active = activeSection === id
          return (
            <a key={href} href={href} style={{ width: 28, height: 28, border: `1.5px solid ${active ? INK : INK}`, background: active ? INK : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: active ? CREAM : INK, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', fontFamily: "'Crimson Text', serif", transition: 'background .3s, color .3s' }}>{n}</a>
          )
        })}
        <a href="#" aria-label="Back to top" style={{ width: 28, height: 28, border: `1.5px solid ${INK}`, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: INK, fontSize: 14, marginTop: 4 }}>↑</a>
      </div>

      {/* ── Notify modal ─────────────────────────────────────────────── */}
      {notifyPlan !== null && (
        <div onClick={() => setNotifyPlan(null)} style={{ position: 'fixed', inset: 0, background: `${INK}cc`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: CREAM, border: `2px solid ${INK}`, padding: '44px 40px', maxWidth: 440, width: '100%', position: 'relative' }}>
            <button onClick={() => setNotifyPlan(null)} style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: INK, lineHeight: 1 }}>×</button>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, fontWeight: 700, color: INK, marginBottom: 8 }}>space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span></div>
            {!notifyDone ? (
              <>
                <p style={{ fontSize: 15, color: `${INK}99`, lineHeight: 1.65, margin: '0 0 24px', fontStyle: 'italic' }}>
                  Leave your email and we'll send you a message when we're ready for sign-ups. No spam, no list, just that one note.
                </p>
                <form onSubmit={async e => {
                  e.preventDefault()
                  setNotifySubmitting(true)
                  await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: notifyEmail, plan: notifyPlan }) })
                  setNotifySubmitting(false)
                  setNotifyDone(true)
                }}>
                  <input type="email" required placeholder="you@example.com" value={notifyEmail} onChange={e => setNotifyEmail(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${INK}`, background: CREAM, fontSize: 15, fontFamily: "'Crimson Text', serif", color: INK, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
                  <button type="submit" disabled={notifySubmitting}
                    style={{ width: '100%', padding: '11px 0', border: `1.5px solid ${INK}`, background: INK, color: CREAM, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: "'Crimson Text', serif", opacity: notifySubmitting ? 0.7 : 1 }}>
                    {notifySubmitting ? '…' : 'Notify me'}
                  </button>
                </form>
              </>
            ) : (
              <p style={{ fontSize: 16, color: INK, lineHeight: 1.65, margin: 0, fontStyle: 'italic' }}>
                We'll email you when we're ready. Talk soon.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
