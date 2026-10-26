export interface WatchState {
  channelId: string
  resourceId: string
  expirationMs: number
  syncToken: string
  calendarId: string
  workspace: string
  workspaceId: string
  roomId: string
  webhookToken?: string
}

async function kv() {
  const { Redis } = await import('@upstash/redis')
  return new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })
}

export async function getWatchState(roomId: string): Promise<WatchState | null> {
  return (await kv()).get<WatchState>(`gcal:watch:${roomId}`)
}

export async function saveWatchState(roomId: string, state: WatchState): Promise<void> {
  const r = await kv()
  await Promise.all([
    r.set(`gcal:watch:${roomId}`, state),
    r.set(`gcal:channel:${state.channelId}`, roomId),
    r.sadd('gcal:watched_rooms', roomId),
  ])
}

// Updates only the sync token, on top of whatever watch state is current *now*.
// The webhook handler holds a watch-state snapshot for the whole (slow) sync;
// writing that snapshot back would clobber a channel the renewal cron swapped
// in meanwhile, and would resurrect state for a room disconnected meanwhile.
export async function saveSyncToken(roomId: string, syncToken: string): Promise<void> {
  const r = await kv()
  const current = await r.get<WatchState>(`gcal:watch:${roomId}`)
  if (!current) return
  await r.set(`gcal:watch:${roomId}`, { ...current, syncToken })
}

export async function removeWatchState(roomId: string, channelId?: string): Promise<void> {
  const r = await kv()
  const ops: Promise<unknown>[] = [
    r.del(`gcal:watch:${roomId}`),
    r.srem('gcal:watched_rooms', roomId),
  ]
  if (channelId) ops.push(r.del(`gcal:channel:${channelId}`))
  await Promise.all(ops)
}

export async function getRoomIdByChannel(channelId: string): Promise<string | null> {
  return (await kv()).get<string>(`gcal:channel:${channelId}`)
}

export async function getAllWatchedRooms(): Promise<string[]> {
  return (await kv()).smembers('gcal:watched_rooms')
}
