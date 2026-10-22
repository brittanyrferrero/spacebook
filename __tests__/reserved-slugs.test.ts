import { describe, it, expect } from 'vitest'
import { RESERVED_SLUGS } from '@/lib/workspace'

describe('RESERVED_SLUGS', () => {
  it('blocks middleware public API segments', () => {
    // These all live in PUBLIC_API_SEGMENTS in middleware.ts — a workspace
    // named any of these would bypass auth for all its API routes.
    for (const slug of ['cancel', 'workspaces', 'notify', 'admin', 'gcal', 'tablet-health', 'version']) {
      expect(RESERVED_SLUGS.has(slug)).toBe(true)
    }
  })

  it('blocks middleware public page segments', () => {
    for (const slug of ['enter', 'demo', 'landing', 'privacy', 'terms']) {
      expect(RESERVED_SLUGS.has(slug)).toBe(true)
    }
  })

  it('blocks Next.js infrastructure paths', () => {
    expect(RESERVED_SLUGS.has('api')).toBe(true)
    expect(RESERVED_SLUGS.has('_next')).toBe(true)
  })

  it('allows normal workspace slugs', () => {
    expect(RESERVED_SLUGS.has('swift-cedar-lake')).toBe(false)
    expect(RESERVED_SLUGS.has('bright-maple-42')).toBe(false)
  })
})
