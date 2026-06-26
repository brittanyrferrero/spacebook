'use client'

import { useEffect } from 'react'

// How long to wait before forcing a reload even without a version change.
// Keeps tablets self-healing without any manual intervention.
const HARD_RELOAD_MS = 30_000 // 30 seconds

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // ChunkLoadError: new deployment invalidated the chunk — reload immediately.
    const isChunkError =
      error.name === 'ChunkLoadError' ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Importing a module script failed')

    if (isChunkError) {
      window.location.reload()
      return
    }

    // For any other error: poll /api/version and reload when a new deploy lands.
    let knownVersion: string | null = null
    async function checkVersion() {
      try {
        const res = await fetch('/api/version')
        const { version } = await res.json()
        if (knownVersion === null) { knownVersion = version; return }
        if (version !== knownVersion) window.location.reload()
      } catch { /* non-fatal */ }
    }
    checkVersion()
    const versionId = setInterval(checkVersion, 2 * 60 * 1000)

    // Hard fallback: reload after HARD_RELOAD_MS no matter what.
    // This recovers tablets that are already stuck on *this* error page
    // if no new deploy arrives to trigger the version check above.
    const hardId = setTimeout(() => window.location.reload(), HARD_RELOAD_MS)

    return () => { clearInterval(versionId); clearTimeout(hardId) }
  }, [error])

  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', margin: 0, background: '#fff' }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 24 }}>An unexpected error occurred. Try refreshing the page.</div>
          <button
            onClick={reset}
            style={{ fontSize: 13, padding: '8px 20px', background: '#111', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
