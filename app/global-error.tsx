'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // ChunkLoadError: new deployment invalidated the chunk the browser queued.
    // Reload immediately — the fresh deployment will serve current chunks.
    const isChunkError =
      error.name === 'ChunkLoadError' ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Importing a module script failed')

    if (isChunkError) {
      window.location.reload()
      return
    }

    // For any other error, keep polling /api/version so tablets self-recover
    // after the next deploy without needing a manual reload.
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
    const id = setInterval(checkVersion, 2 * 60 * 1000)
    return () => clearInterval(id)
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
