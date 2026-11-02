'use client'

// Public demo page (space-book.net/demo), styled after the Linen tablet design:
// same palette, Fraunces + Figtree, segmented control. Standalone on purpose — the
// marketing page at /home keeps its own dark style.

import { useState, useEffect } from 'react'
import { Fraunces, Figtree } from 'next/font/google'

const fraunces = Fraunces({ subsets: ['latin'], axes: ['opsz'], variable: '--ln-serif', display: 'swap' })
const figtree  = Figtree({ subsets: ['latin'], variable: '--ln-sans', display: 'swap' })

type Tab = 'desktop' | 'tablet' | 'admin'

const DEMO = 'https://demo.space-book.net'
const TABS: { key: Tab; label: string; url: string; desc: string; fw: number; fh: number; scale: number }[] = [
  {
    key: 'desktop', label: 'Desktop', url: `${DEMO}/swift-cedar-lake`,
    desc: 'The main booking view: every room on one calendar. Click any open slot to book it.',
    fw: 1280, fh: 780, scale: 0.72,
  },
  {
    // Shows Linen because the demo workspace defaults to it (lib/mock/store.ts). No ?design=
    // override, so switching the design in the Admin tab still changes this view.
    key: 'tablet', label: 'Tablet', url: `${DEMO}/swift-cedar-lake/room/r2`,
    desc: 'Mount one outside each room. Shows whether the room is free from across the hallway, and takes walk-in bookings.',
    fw: 820, fh: 1180, scale: 0.55,
  },
  {
    key: 'admin', label: 'Admin', url: `${DEMO}/swift-cedar-lake/admin`,
    desc: 'Manage rooms and bookings, see usage analytics, and change workspace settings.',
    fw: 1280, fh: 780, scale: 0.72,
  },
]

const CSS = `
.dm-root { --linen:#f3ede3; --card:#fbf8f2; --ink:#2a2522; --muted:#5e554d; --line:#ebe3d6; --accent:#6f8f6a;
  min-height:100vh; background:var(--linen); color:var(--ink); font-family:var(--ln-sans), system-ui, sans-serif;
  overflow-x:hidden; }
.dm-root * { box-sizing:border-box; }
.dm-serif { font-family:var(--ln-serif), Georgia, serif; }
.dm-wrap { max-width:1020px; margin:0 auto; padding:0 16px; }

.dm-nav { display:flex; align-items:center; justify-content:space-between; padding:24px 0; }
.dm-mark { font-size:24px; font-weight:500; letter-spacing:0.01em; color:var(--ink); text-decoration:none; }
.dm-mark i { font-weight:400; }
.dm-pill { font-size:13px; font-weight:600; color:var(--muted); background:#ece4d7; border-radius:999px; padding:6px 14px; }

.dm-hero { max-width:760px; margin:0 auto; text-align:center; padding:56px 0 64px; }
.dm-lead { font-size:clamp(28px, 4.4vw, 46px); font-weight:400; line-height:1.15; letter-spacing:-0.02em; margin:0 0 24px;
  font-variation-settings:'opsz' 36; }
.dm-body { font-size:clamp(16px, 1.8vw, 19px); line-height:1.65; color:var(--muted); margin:0 auto; max-width:640px; }

.dm-card { background:var(--card); border-radius:28px; padding:40px 28px 32px; margin-bottom:56px;
  box-shadow:0 18px 50px rgba(42,37,34,0.08); }
.dm-cardhead { text-align:center; margin-bottom:24px; }
.dm-h2 { font-size:clamp(26px, 3.4vw, 34px); font-weight:400; letter-spacing:-0.01em; margin:0 0 10px; }
.dm-note { font-size:15px; line-height:1.6; color:var(--muted); margin:0 auto; max-width:620px; }

.dm-segs { display:inline-flex; gap:4px; background:#ece4d7; border-radius:14px; padding:4px; }
.dm-seg { height:42px; padding:0 20px; background:transparent; color:var(--ink); border:none; border-radius:11px;
  font:inherit; font-size:15px; font-weight:500; cursor:pointer; transition:background .15s, color .15s; }
.dm-seg.on { background:var(--ink); color:var(--linen); font-weight:600; }
.dm-seg:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.dm-desc { font-size:14px; color:var(--muted); text-align:center; margin:14px auto 24px; max-width:560px; line-height:1.55; min-height:44px; }

.dm-frame { margin:0 auto; border-radius:18px; overflow:hidden; border:1px solid #ddd2c1; background:var(--linen);
  box-shadow:0 24px 60px rgba(42,37,34,0.18); position:relative; }
.dm-frame iframe { border:none; display:block; transform-origin:top left; }
.dm-loading { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:14px; color:var(--muted); }

.dm-foot { border-top:1px solid #ddd2c1; padding:28px 0 40px; display:flex; justify-content:space-between; align-items:center;
  flex-wrap:wrap; gap:12px; font-size:13px; color:var(--muted); }
.dm-foot a { color:var(--muted); }

@media (max-width: 640px) {
  .dm-hero { padding:32px 0 40px; }
  .dm-card { padding:28px 16px 24px; border-radius:22px; }
  .dm-seg { padding:0 14px; }
}
`

export default function DemoPage() {
  const [tab, setTab]     = useState<Tab>('desktop')
  const [ready, setReady] = useState(false)
  const [winW, setWinW]   = useState(0)

  // Sets the cookie that lets the iframes into the demo workspace.
  useEffect(() => {
    fetch('/api/demo-access').finally(() => setReady(true))
  }, [])

  useEffect(() => {
    const update = () => setWinW(window.innerWidth)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const cur = TABS.find(t => t.key === tab)!
  // Card padding + page gutter on each side; shrink the preview to fit narrow screens.
  const avail = winW > 0 ? Math.min(winW, 1020) - (winW <= 640 ? 64 : 88) : cur.fw * cur.scale
  const scale = Math.min(cur.scale, avail / cur.fw)
  const w = Math.round(cur.fw * scale)
  const h = Math.round(cur.fh * scale)

  return (
    <div className={`dm-root ${fraunces.variable} ${figtree.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="dm-wrap">
        <nav className="dm-nav">
          <a href="/" className="dm-mark dm-serif">space<i>book</i></a>
          <span className="dm-pill">Live demo</span>
        </nav>

        <header className="dm-hero">
          <h1 className="dm-lead dm-serif">
            A booking tool for coworking spaces that share resources — rooms, call booths, tools, desks, etc.
          </h1>
          <p className="dm-body">
            It integrates with Google Calendar, lets admins own their data, provides useful analytics,
            doesn&apos;t require accounts, and is hardware-agnostic.
          </p>
        </header>

        <section className="dm-card" aria-labelledby="dm-try">
          <div className="dm-cardhead">
            <h2 id="dm-try" className="dm-h2 dm-serif">Try it yourself</h2>
            <p className="dm-note">
              This is the real app, running with sample data. Make bookings, edit rooms, and explore the admin
              panel — each visitor gets their own isolated session, so your changes are only visible to you.
            </p>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div className="dm-segs" role="tablist" aria-label="Demo view">
              {TABS.map(t => (
                <button key={t.key} role="tab" aria-selected={tab === t.key}
                  className={`dm-seg${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <p className="dm-desc">{cur.desc}</p>

          <div className="dm-frame" style={{ width: w, height: h }}>
            {ready ? (
              <iframe key={tab} src={cur.url} title={`Spacebook ${cur.label} view`}
                style={{ width: cur.fw, height: cur.fh, transform: `scale(${scale})` }} />
            ) : (
              <div className="dm-loading">Loading…</div>
            )}
          </div>
        </section>

        <footer className="dm-foot">
          {/* The original pink Spacebook wordmark, kept from the old page */}
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            space<span style={{ color: '#db95ab', fontWeight: 300 }}>book</span>
          </span>
          <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></span>
        </footer>
      </div>
    </div>
  )
}
