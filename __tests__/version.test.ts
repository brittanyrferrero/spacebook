import { describe, it, expect } from 'vitest'

describe('version endpoint', () => {
  it('returns a non-empty version string', async () => {
    const { GET } = await import('@/app/api/version/route')
    const res = GET()
    const body = await res.json()
    expect(typeof body.version).toBe('string')
    expect(body.version.length).toBeGreaterThan(0)
  })
})
