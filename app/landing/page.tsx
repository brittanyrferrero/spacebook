'use client'

import { useState, useEffect } from 'react'

type Tab = 'desktop' | 'tablet' | 'admin'

const CREAM  = '#f0ece4'
const CREAM2 = '#e4dfd6'
const INK    = '#1c1510'

const TABS: { key: Tab; label: string; url: string; fw: number; fh: number; scale: number }[] = [
  { key: 'desktop', label: 'Desktop',  url: '/?demo=1',    fw: 1280, fh: 780, scale: 0.72 },
  { key: 'tablet',  label: 'Tablet',   url: '/room/r2',    fw: 500,  fh: 880, scale: 0.78 },
  { key: 'admin',   label: 'Admin',    url: '/demo-admin', fw: 1280, fh: 780, scale: 0.72 },
]

const PLANS = [
  { name: 'Nook',       rooms: '1 – 2 rooms',          price: { monthly: 30,  annual: 25  }, blurb: 'A good fit for small offices and studios just getting started.',                                                       features: ['Up to 2 rooms', 'Hosted & managed', 'Google Calendar sync', 'Email support', '14-day free trial'],                 cta: 'Get started', href: '#' },
  { name: 'Hub',        rooms: '3 – 5 rooms',           price: { monthly: 52,  annual: 44  }, blurb: 'For coworking spaces and places with a handful of bookable rooms.',                                                    features: ['Up to 5 rooms', 'Hosted & managed', 'Google Calendar sync', 'Email support', '14-day free trial'],                 cta: 'Get started', href: '#' },
  { name: 'Commons',    rooms: '6 – 12 rooms',          price: { monthly: 120, annual: 100 }, blurb: 'For larger shared spaces that want custom branding and hands-on support.',                                             features: ['Up to 12 rooms', 'Custom domain & branding', 'Google Calendar sync', 'Priority support', '14-day free trial'],     cta: 'Get started', href: '#' },
  { name: 'Enterprise', rooms: 'Multiple locations',  price: null,                          blurb: "Running several sites, need a custom integration, or want us to guide you through the setup? Let's talk.",            features: ['Multiple locations', 'Custom integrations', 'Dedicated support', 'Custom contract & invoicing'],                  cta: 'Contact us', href: 'mailto:hello@spacebook.app' },
]

const FEATURES: { title: string; body: string; icon: JSX.Element }[] = [
  { title: 'Frictionless access', body: 'No app to download, and no confusing onboarding.', icon: (
    <svg viewBox="0 0 24 24" width={36} height={36} style={{ marginBottom: 16, display: 'block' }}>
      {/* Skeleton key */}
      <circle fill={INK} cx={10} cy={8} r={7}/>
      <circle fill={CREAM} cx={10} cy={8} r={4}/>
      <rect fill={INK} x={8.5} y={13} width={3} height={11}/>
      <rect fill={INK} x={11.5} y={17} width={5} height={2.5}/>
      <rect fill={INK} x={11.5} y={21} width={4} height={2}/>
    </svg>
  )},
  { title: 'Recurring bookings', body: 'Set it once and it repeats until you say otherwise.', icon: (
    <svg viewBox="0 0 24 24" width={36} height={36} style={{ marginBottom: 16, display: 'block' }}>
      {/* Crescent moon */}
      <path fill={INK} fillRule="evenodd" d="M22,12 A10,10,0,1,1,2,12 A10,10,0,1,1,22,12 Z M23,12 A8,8,0,1,0,7,12 A8,8,0,1,0,23,12 Z"/>
    </svg>
  )},
  { title: 'Your data', body: "Self-host it, or let us run it. Either way, nothing is sold or shared.", icon: (
    <svg viewBox="0 0 24 24" width={36} height={36} style={{ marginBottom: 16, display: 'block' }}>
      {/* Padlock */}
      <rect fill={INK} x={5} y={3} width={14} height={12} rx={7}/>
      <rect fill={CREAM} x={8} y={3} width={8} height={10} rx={4}/>
      <rect fill={INK} x={3} y={11} width={18} height={12}/>
      <circle fill={CREAM} cx={12} cy={17} r={2.5}/>
      <rect fill={CREAM} x={11} y={18.5} width={2} height={3}/>
    </svg>
  )},
  { title: 'Google Calendar', body: "Add a room when you're scheduling your meeting and easily view potential conflicts.", icon: (
    <svg viewBox="0 0 24 24" width={36} height={36} style={{ marginBottom: 16, display: 'block' }}>
      {/* Calendar with plus */}
      <rect fill={INK} x={2} y={5} width={20} height={17}/>
      <rect fill={CREAM} x={4} y={10} width={16} height={10}/>
      <rect fill={CREAM} x={7} y={2} width={3} height={6}/>
      <rect fill={CREAM} x={14} y={2} width={3} height={6}/>
      <rect fill={INK} x={11} y={12} width={2} height={6}/>
      <rect fill={INK} x={8} y={14} width={8} height={2}/>
    </svg>
  )},
  { title: 'Built to fit', body: "Customizable to your team and space's needs.", icon: (
    <svg viewBox="0 0 24 24" width={36} height={36} style={{ marginBottom: 16, display: 'block' }}>
      {/* Faceted gem */}
      <polygon fill={INK} points="12,1 21,6.5 21,17.5 12,23 3,17.5 3,6.5"/>
      <polygon fill={CREAM} points="12,12 12,3 19.5,7.5"/>
      <polygon fill={CREAM} points="12,12 19.5,16.5 12,21"/>
      <polygon fill={CREAM} points="12,12 4.5,7.5 4.5,16.5"/>
    </svg>
  )},
  { title: 'Any tablet', body: 'Mount any iPad or Android tablet outside the door. No proprietary hardware, no extra cost.', icon: (
    <svg viewBox="0 0 24 24" width={36} height={36} style={{ marginBottom: 16, display: 'block' }}>
      {/* Tablet with calendar on screen */}
      <rect fill={INK} x={4} y={1} width={16} height={22} rx={1}/>
      <rect fill={CREAM} x={6} y={3} width={12} height={16}/>
      <rect fill={INK} x={8} y={6} width={8} height={8}/>
      <rect fill={CREAM} x={9} y={9} width={6} height={4}/>
      <rect fill={INK} x={8} y={7.5} width={8} height={2}/>
      <circle fill={INK} cx={12} cy={21} r={1}/>
    </svg>
  )},
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

function Owl() {
  return (
    <svg viewBox="0 0 160 200" width={160} height={200} style={{ display: 'block' }}>
      <rect fill={INK} x={0} y={175} width={160} height={10} rx={4}/>
      <ellipse fill={INK} cx={80} cy={148} rx={52} ry={40}/>
      <ellipse fill={CREAM} cx={80} cy={155} rx={26} ry={29}/>
      <rect fill={INK} x={60} y={140} width={40} height={3} rx={1}/>
      <rect fill={INK} x={60} y={149} width={40} height={3} rx={1}/>
      <rect fill={INK} x={62} y={158} width={36} height={3} rx={1}/>
      <rect fill={INK} x={65} y={167} width={30} height={3} rx={1}/>
      <circle fill={INK} cx={80} cy={75} r={50}/>
      <polygon fill={INK} points="48,32 38,2 68,32"/>
      <polygon fill={INK} points="112,32 122,2 92,32"/>
      <circle fill={CREAM} cx={60} cy={72} r={21}/>
      <circle fill={INK} cx={60} cy={72} r={13}/>
      <circle fill={CREAM} cx={65} cy={65} r={5}/>
      <circle fill={CREAM} cx={100} cy={72} r={21}/>
      <circle fill={INK} cx={100} cy={72} r={13}/>
      <circle fill={CREAM} cx={105} cy={65} r={5}/>
      <polygon fill={CREAM} points="72,90 88,90 80,106"/>
    </svg>
  )
}

function Clouds() {
  return (
    <svg viewBox="0 0 600 90" style={{ display: 'block', width: '100%' }}>
      <ellipse fill={INK} cx={70} cy={70} rx={42} ry={30}/>
      <ellipse fill={INK} cx={115} cy={50} rx={50} ry={36}/>
      <ellipse fill={INK} cx={168} cy={62} rx={38} ry={28}/>
      <ellipse fill={INK} cx={380} cy={68} rx={36} ry={26}/>
      <ellipse fill={INK} cx={422} cy={48} rx={48} ry={34}/>
      <ellipse fill={INK} cx={472} cy={58} rx={40} ry={29}/>
      <ellipse fill={INK} cx={518} cy={66} rx={32} ry={23}/>
    </svg>
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

  return (
    <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: INK, overflowX: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,600;0,700;1,400&family=Space+Grotesk:wght@300;400;500&display=swap');
        html { scroll-behavior: smooth }
        @keyframes flicker {
          0%, 100% { opacity: 1; } 50% { opacity: 0.85; }
        }
      ` }} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div style={{ background: INK, position: 'relative', overflow: 'hidden', minHeight: '75vh', display: 'flex', flexDirection: 'column' }}>

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

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 44px', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 18, fontWeight: 600, color: CREAM, letterSpacing: '0.04em' }}>
            space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span>
          </div>
          <a href="#pricing" style={{ padding: '8px 22px', border: `1.5px solid ${CREAM}`, color: CREAM, textDecoration: 'none', fontFamily: "'Spectral', Georgia, serif", letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}>
            Get started
          </a>
        </nav>

        {/* Hero content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px 24px 52px', position: 'relative', zIndex: 1, gap: 0 }}>

          <h1 style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 'clamp(52px, 8vw, 96px)', fontWeight: 400, color: CREAM, letterSpacing: '0em', lineHeight: 1, margin: '0 0 20px' }}>
            Book space.
          </h1>

          <p style={{ fontSize: 'clamp(15px, 1.8vw, 18px)', color: `${CREAM}99`, lineHeight: 1.7, maxWidth: 560, margin: '0 0 48px' }}>
            Created for coworking spaces, offices, studios, maker spaces, and anywhere else people share rooms and need a simple way to book them.
          </p>

          {/* Section nav */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {([['#features', 'I. Features'], ['#demo', 'II. Demo'], ['#pricing', 'III. Pricing']] as const).map(([href, label]) => (
              <a key={href} href={href} style={{ fontSize: 11, padding: '8px 20px', background: CREAM, color: INK, textDecoration: 'none', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Spectral', Georgia, serif" }}>
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
            <h2 style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 600, color: INK, letterSpacing: '-0.01em', margin: '0 0 20px' }}>
              What it does
            </h2>
            <Divider />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
            {FEATURES.map((f, i) => (
              <div key={f.title} style={{ padding: '32px 28px', border: `1.5px solid ${INK}`, marginLeft: i % 3 === 0 ? 0 : -1.5, marginTop: i >= 3 ? -1.5 : 0, background: CREAM, position: 'relative' }}>
                {f.icon}
                <div style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 15, fontWeight: 600, color: INK, marginBottom: 10, letterSpacing: '0.01em' }}>{f.title}</div>
                <div style={{ fontSize: 14, color: `${INK}99`, lineHeight: 1.65 }}>{f.body}</div>
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
            <h2 style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 600, color: CREAM, letterSpacing: '-0.01em', margin: '0 0 16px' }}>
              Try it yourself
            </h2>
            <p style={{ fontSize: 16, color: `${CREAM}99`, margin: '0 0 28px' }}>
              This is the real app, running with sample data.
            </p>
            <p style={{ fontSize: 14, color: `${CREAM}bb`, margin: 0 }}>
              Toggle between the desktop view, tablet version, and admin panel below.
            </p>
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 0, marginBottom: 32 }}>
            {TABS.map((t, i) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ fontSize: 12, padding: '10px 28px', border: `1.5px solid ${CREAM}55`, borderLeft: i > 0 ? 'none' : `1.5px solid ${CREAM}55`, cursor: 'pointer', fontFamily: "'Spectral', Georgia, serif", letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'background .15s, color .15s',
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
            <div style={{ border: `1.5px solid ${CREAM}`, overflow: 'hidden', background: '#1e2332' }}>
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
            <h2 style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 600, color: INK, letterSpacing: '-0.01em', margin: '0 0 12px' }}>
              Plan options
            </h2>
            <p style={{ fontSize: 16, color: `${INK}77`, margin: '0 0 32px' }}>No per-seat fees. No surprise limits.</p>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
            {PLANS.map((p, i) => {
              const price = p.price ? p.price[annual ? 'annual' : 'monthly'] : null
              return (
                <div key={p.name} style={{ background: '#faf8f5', border: `1.5px solid ${INK}55`, padding: '32px 28px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: `${INK}66`, marginBottom: 12 }}>{p.name}</div>
                  <div style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 17, fontWeight: 600, color: INK, marginBottom: 20 }}>{p.rooms}</div>
                  <div style={{ marginBottom: 20 }}>
                    {price === null ? (
                      <span style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 26, fontWeight: 600, color: INK }}>Let's talk</span>
                    ) : (
                      <span style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 34, fontWeight: 400, color: INK }}>
                        ${price}<span style={{ fontSize: 13, fontWeight: 400, fontStyle: 'italic', color: `${INK}66` }}>/mo</span>
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 14, color: `${INK}88`, lineHeight: 1.6, margin: '0 0 20px', flex: 1 }}>{p.blurb}</p>
                  <div style={{ height: 1, background: `${INK}22`, marginBottom: 20 }} />
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {p.features.map(f => (
                      <li key={f} style={{ fontSize: 13, color: INK, display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.4 }}>
                        <Star4 size={5} color={INK} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a href={undefined}
                    onClick={(e) => { e.preventDefault(); setNotifyPlan(p.name); setNotifyDone(false); setNotifyEmail('') }}
                    style={{ display: 'block', textAlign: 'center', padding: '11px 0', border: `1.5px solid ${INK}`, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none', cursor: 'pointer', color: CREAM, background: INK, fontFamily: "'Spectral', Georgia, serif" }}>
                    {p.cta}
                  </a>
                </div>
              )
            })}
          </div>

          <p style={{ textAlign: 'center', fontSize: 14, color: `${INK}66`, marginTop: 36, lineHeight: 1.7 }}>
            Hosted plans include a 14-day free trial — no credit card required.<br />
            Annual plans are billed once per year, and we'll send you a reminder.
          </p>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div style={{ background: INK, padding: '40px 44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 16, fontWeight: 600, color: CREAM, letterSpacing: '0.04em' }}>
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
        {([['#features', 'features', 'I'], ['#demo', 'demo', 'II'], ['#pricing', 'pricing', 'III']] as const).map(([href, id, n]) => {
          const active = activeSection === id
          return (
            <a key={href} href={href} style={{ width: 28, height: 28, border: '1.5px solid #888', background: active ? '#888' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: active ? CREAM : '#888', fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', fontFamily: "'Spectral', Georgia, serif", transition: 'background .3s, color .3s' }}>{n}</a>
          )
        })}
        <a href="#" aria-label="Back to top" style={{ width: 28, height: 28, border: '1.5px solid #888', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#888', fontSize: 14, marginTop: 4 }}>↑</a>
      </div>

      {/* ── Notify modal ─────────────────────────────────────────────── */}
      {notifyPlan !== null && (
        <div onClick={() => setNotifyPlan(null)} style={{ position: 'fixed', inset: 0, background: `${INK}cc`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: CREAM, border: `2px solid ${INK}`, padding: '44px 40px', maxWidth: 440, width: '100%', position: 'relative' }}>
            <button onClick={() => setNotifyPlan(null)} style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: INK, lineHeight: 1 }}>×</button>
            <div style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 20, fontWeight: 700, color: INK, marginBottom: 8 }}>space<span style={{ fontStyle: 'italic', fontWeight: 400 }}>book</span></div>
            {!notifyDone ? (
              <>
                <p style={{ fontSize: 15, color: `${INK}99`, lineHeight: 1.65, margin: '0 0 24px' }}>
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
                    style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${INK}`, background: CREAM, fontSize: 15, fontFamily: "'Space Grotesk', sans-serif", color: INK, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
                  <button type="submit" disabled={notifySubmitting}
                    style={{ width: '100%', padding: '11px 0', border: `1.5px solid ${INK}`, background: INK, color: CREAM, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: "'Spectral', Georgia, serif", opacity: notifySubmitting ? 0.7 : 1 }}>
                    {notifySubmitting ? '…' : 'Notify me'}
                  </button>
                </form>
              </>
            ) : (
              <p style={{ fontSize: 16, color: INK, lineHeight: 1.65, margin: 0 }}>
                We'll email you when we're ready. Talk soon.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
