import type { GcalTokens } from '@/lib/mock/store'

const MOCK = process.env.MOCK_MODE === 'true'

export async function getTokens(roomId: string): Promise<GcalTokens | null> {
  if (MOCK) {
    const { getSessionStore } = await import('@/lib/mock/store')
    const store = await getSessionStore()
    return store.gcalTokens[roomId] ?? null
  }
  const { Redis } = await import('@upstash/redis')
  const kv = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
  return kv.get<GcalTokens>(`gcal:tokens:${roomId}`)
}

export async function saveTokens(roomId: string, tokens: GcalTokens): Promise<void> {
  if (MOCK) {
    const { getSessionStore, saveSessionStore } = await import('@/lib/mock/store')
    const store = await getSessionStore()
    store.gcalTokens[roomId] = tokens
    await saveSessionStore(store)
    return
  }
  const { Redis } = await import('@upstash/redis')
  const kv = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
  await kv.set(`gcal:tokens:${roomId}`, tokens)
}

export async function removeTokens(roomId: string): Promise<void> {
  if (MOCK) {
    const { getSessionStore, saveSessionStore } = await import('@/lib/mock/store')
    const store = await getSessionStore()
    delete store.gcalTokens[roomId]
    await saveSessionStore(store)
    return
  }
  const { Redis } = await import('@upstash/redis')
  const kv = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
  await kv.del(`gcal:tokens:${roomId}`)
}

export async function hasTokens(roomId: string): Promise<boolean> {
  return (await getTokens(roomId)) !== null
}
