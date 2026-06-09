import { Redis } from '@upstash/redis'

const kvUrl   = process.env.KV_REST_API_URL
const kvToken = process.env.KV_REST_API_TOKEN
const kv = kvUrl && kvToken ? new Redis({ url: kvUrl, token: kvToken }) : null
import type { Room, Booking, RecurringSeries, Member } from '@/types'

export interface GcalTokens {
  refresh_token: string
  access_token?: string
  expiry?: string
}

export interface MockStore {
  rooms: Room[]
  bookings: Booking[]
  series: RecurringSeries[]
  members: Member[]
  roomTypes: string[]
  amenityOptions: string[]
  bookingHours: { start: number; end: number }
  displayHours: { start: number; end: number }
  bookingVisibility: { showTitle: boolean; showOrganizer: boolean; allowEditOthers: boolean }
  countWeekends: boolean
  tzOffset?: number
  gcalTokens: Record<string, GcalTokens>   // room_id → tokens
}

const SESSION_TTL_S = 2 * 60 * 60 // 2 hours

// h is in Pacific Daylight Time (UTC-7); convert to UTC so meetings appear at the right time regardless of server timezone
function t(dayOffset: number, h: number, m = 0): string {
  const utcH = h + 7
  const now = new Date()
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return new Date(todayUTC + (dayOffset * 24 * 60 + utcH * 60 + m) * 60_000).toISOString()
}

const ROOMS: Room[] = [
  { id: 'r1', name: 'Lovelace', room_type: 'Meeting Room',    capacity: 4,  amenities: ['Whiteboard', 'TV'],                        google_calendar_id: null, tablet_token: 'a1b2c3d4', display_order: 1, is_active: true,  created_at: new Date().toISOString() },
  { id: 'r2', name: 'Turing',   room_type: 'Conference Room', capacity: 8,  amenities: ['TV', 'Video conferencing'],                 google_calendar_id: null, tablet_token: 'e5f6a7b8', display_order: 2, is_active: true,  created_at: new Date().toISOString() },
  { id: 'r3', name: 'Hopper',   room_type: 'Meeting Room',    capacity: 6,  amenities: ['Natural light', 'Whiteboard'],              google_calendar_id: null, tablet_token: 'c9d0e1f2', display_order: 3, is_active: true,  created_at: new Date().toISOString() },
  { id: 'r4', name: 'Dijkstra', room_type: 'Boardroom',       capacity: 12, amenities: ['TV', 'Whiteboard', 'Video conferencing'],  google_calendar_id: null, tablet_token: '3a4b5c6d', display_order: 4, is_active: true,  created_at: new Date().toISOString() },
  { id: 'r5', name: 'Shannon',  room_type: 'Focus Room',      capacity: 3,  amenities: ['Whiteboard'],                               google_calendar_id: null, tablet_token: '7e8f9a0b', display_order: 5, is_active: true,  created_at: new Date().toISOString() },
  { id: 'r6', name: 'Babbage',  room_type: 'Phone Booth',     capacity: 2,  amenities: ['TV'],                                       google_calendar_id: null, tablet_token: 'b1c2d3e4', display_order: 6, is_active: false, created_at: new Date().toISOString() },
]

function bk(id: string, roomId: string, name: string, email: string, title: string, dayOffset: number, startH: number, endH: number, startM = 0, endM = 0): Booking {
  return { id, room_id: roomId, recurring_series_id: null, booker_name: name, booker_email: email, title, start_time: t(dayOffset, startH, startM), end_time: t(dayOffset, endH, endM), cancel_token: `tok-${id}`, google_event_id: null, cancelled_at: null, created_at: t(dayOffset - 1, 10) }
}

function makeSeedBookings(): Booking[] {
  return [
    bk('b1',  'r1', 'Alex Kim',       'alex@example.com',   'Team standup',      0,   9,  9,  0,  30),
    bk('b2',  'r1', 'Marcus Johnson', 'marcus@example.com', 'Client call',       0,  11, 11,  0,  30),
    bk('b3',  'r2', 'Maria Santos',   'maria@example.com',  'Product review',    0,  10, 12),
    bk('b4',  'r4', 'Amara Osei',     'amara@example.com',  'Board meeting',     0,  14, 16),
    bk('b5',  'r3', 'Sofia Reyes',    'sofia@example.com',  'Design sprint',     0,   9, 11),
    bk('b6',  'r5', 'Priya Nair',     'priya@example.com',  '1:1',               0,  13, 13,  0,  30),
    bk('b6b', 'r2', 'Tom Blake',      'tom@example.com',    'Engineering sync',  0,  15, 16),
    bk('b6c', 'r4', 'Zara Ahmed',     'zara@example.com',   'Retro',             0,  16, 17),
    bk('b7',  'r1', 'Tom Blake',      'tom@example.com',    'Kickoff',          -1,  10, 11),
    bk('b8',  'r2', 'Zara Ahmed',     'zara@example.com',   'Sprint retro',     -1,  14, 15, 30),
    bk('b9',  'r4', 'Alex Kim',       'alex@example.com',   'All-hands',        -1,   9, 11),
    bk('b10', 'r1', 'Sofia Reyes',    'sofia@example.com',  'Workshop',         -2,  13, 15),
    bk('b11', 'r3', 'Marcus Johnson', 'marcus@example.com', 'Interview',        -2,  10, 11),
    bk('b12', 'r2', 'Maria Santos',   'maria@example.com',  'Planning',         -3,   9, 10, 30),
    bk('b13', 'r4', 'Amara Osei',     'amara@example.com',  'Quarterly review', -3,  13, 17),
    bk('b14', 'r1', 'Priya Nair',     'priya@example.com',  'Sync',             -4,  15, 15, 30),
    bk('b15', 'r5', 'Tom Blake',      'tom@example.com',    'Brainstorm',       -4,  11, 12),
    bk('b16', 'r3', 'Zara Ahmed',     'zara@example.com',   'UX review',        -5,  14, 16),
    bk('b17', 'r2', 'Alex Kim',       'alex@example.com',   'Demo',             -5,  10, 11),
    bk('b18', 'r1', 'Sofia Reyes',    'sofia@example.com',  'Standup',          -6,   9,  9, 30),
    bk('b19', 'r4', 'Marcus Johnson', 'marcus@example.com', 'Leadership sync',  -6,  14, 15),
    bk('b20', 'r3', 'Maria Santos',   'maria@example.com',  'Research session', -7,  10, 12),
    bk('b21', 'r1', 'Amara Osei',     'amara@example.com',  'Standup',         -10,   9,  9, 30),
    bk('b22', 'r2', 'Priya Nair',     'priya@example.com',  'Workshop',        -10,  13, 15),
    bk('b23', 'r4', 'Tom Blake',      'tom@example.com',    'Strategy',        -12,  10, 12),
    bk('b24', 'r3', 'Zara Ahmed',     'zara@example.com',   'Team lunch',      -14,  12, 13),
    bk('b25', 'r1', 'Alex Kim',       'alex@example.com',   'Standup',         -14,   9,  9, 30),
    bk('b26', 'r5', 'Sofia Reyes',    'sofia@example.com',  '1:1',             -15,  11, 11, 30),
    bk('b27', 'r2', 'Marcus Johnson', 'marcus@example.com', 'Roadmap',         -17,  14, 16),
    bk('b28', 'r4', 'Maria Santos',   'maria@example.com',  'All-hands',       -20,   9, 11),
    bk('b29', 'r1', 'Amara Osei',     'amara@example.com',  'Standup',         -21,   9,  9, 30),
    bk('b30', 'r3', 'Priya Nair',     'priya@example.com',  'Sprint planning', -21,  10, 12),
    bk('f1',  'r1', 'Alex Kim',       'alex@example.com',   'Standup',           1,   9,  9,  0,  30),
    bk('f2',  'r2', 'Maria Santos',   'maria@example.com',  'Planning',          1,  10, 11, 30),
    bk('f3',  'r4', 'Amara Osei',     'amara@example.com',  'Strategy review',   1,  14, 16),
    bk('f4',  'r1', 'Marcus Johnson', 'marcus@example.com', 'Client call',       2,  11, 12),
    bk('f5',  'r3', 'Sofia Reyes',    'sofia@example.com',  'Design session',    2,   9, 11),
    bk('f6',  'r2', 'Priya Nair',     'priya@example.com',  'Workshop',          3,  13, 15),
    bk('f7',  'r4', 'Tom Blake',      'tom@example.com',    'All-hands',         3,   9, 11),
    bk('f8',  'r1', 'Zara Ahmed',     'zara@example.com',   'Standup',           4,   9,  9,  0,  30),
    bk('f9',  'r3', 'Alex Kim',       'alex@example.com',   'Interview',         5,  10, 11),
    bk('f10', 'r2', 'Maria Santos',   'maria@example.com',  'Roadmap review',    5,  14, 16),
    bk('f11', 'r1', 'Sofia Reyes',    'sofia@example.com',  'Standup',           7,   9,  9,  0,  30),
    bk('f12', 'r4', 'Marcus Johnson', 'marcus@example.com', 'Board meeting',     7,  13, 17),
    bk('f13', 'r3', 'Amara Osei',     'amara@example.com',  'Sprint planning',   8,  10, 12),
    bk('f14', 'r2', 'Priya Nair',     'priya@example.com',  '1:1',               9,  15, 15, 30),
    bk('f15', 'r1', 'Tom Blake',      'tom@example.com',    'Standup',          10,   9,  9,  0,  30),
    bk('f16', 'r5', 'Zara Ahmed',     'zara@example.com',   'Brainstorm',       10,  11, 12, 30),
    bk('f17', 'r4', 'Alex Kim',       'alex@example.com',   'Quarterly review', 12,   9, 12),
    bk('f18', 'r1', 'Maria Santos',   'maria@example.com',  'Standup',          14,   9,  9,  0,  30),
    bk('f19', 'r3', 'Marcus Johnson', 'marcus@example.com', 'UX review',        14,  14, 16),
    bk('f20', 'r2', 'Sofia Reyes',    'sofia@example.com',  'Demo',             15,  10, 11),
  ]
}

const SEED_MEMBERS: Member[] = [
  { id: 'm1', name: 'Alex Kim',       email: 'alex@example.com',   added_at: new Date().toISOString() },
  { id: 'm2', name: 'Marcus Johnson', email: 'marcus@example.com', added_at: new Date().toISOString() },
  { id: 'm3', name: 'Maria Santos',   email: 'maria@example.com',  added_at: new Date().toISOString() },
  { id: 'm4', name: 'Amara Osei',     email: 'amara@example.com',  added_at: new Date().toISOString() },
  { id: 'm5', name: 'Sofia Reyes',    email: 'sofia@example.com',  added_at: new Date().toISOString() },
  { id: 'm6', name: 'Priya Nair',     email: 'priya@example.com',  added_at: new Date().toISOString() },
  { id: 'm7', name: 'Tom Blake',      email: 'tom@example.com',    added_at: new Date().toISOString() },
  { id: 'm8', name: 'Zara Ahmed',     email: 'zara@example.com',   added_at: new Date().toISOString() },
]

function createStore(): MockStore {
  return {
    rooms: JSON.parse(JSON.stringify(ROOMS)),
    bookings: makeSeedBookings(),
    series: [],
    members: JSON.parse(JSON.stringify(SEED_MEMBERS)),
    roomTypes: ['Meeting Room', 'Conference Room', 'Boardroom', 'Focus Room', 'Phone Booth'],
    amenityOptions: ['TV', 'Whiteboard', 'Video conferencing', 'Phone', 'Natural light'],
    bookingHours: { start: 6, end: 22 },
    displayHours: { start: 8, end: 20 },
    bookingVisibility: { showTitle: false, showOrganizer: false, allowEditOthers: false },
    countWeekends: false,
    gcalTokens: {},
  }
}

async function getSessionId(): Promise<string> {
  const { headers } = await import('next/headers')
  const h = await headers()
  return h.get('x-sb-session') ?? 'default'
}

export async function getSessionStore(): Promise<MockStore> {
  if (!kv) return createStore()
  const sessionId = await getSessionId()
  const existing = await kv.get<MockStore>(`mock:${sessionId}`)
  if (existing) {
    const defaults = createStore()
    let dirty = false
    if (!existing.amenityOptions)    { existing.amenityOptions    = defaults.amenityOptions;    dirty = true }
    if (!existing.bookingHours)      { existing.bookingHours      = defaults.bookingHours;      dirty = true }
    if (!existing.displayHours)      { existing.displayHours      = existing.bookingHours ?? defaults.displayHours; existing.bookingHours = defaults.bookingHours; dirty = true }
    if (!existing.roomTypes)         { existing.roomTypes         = defaults.roomTypes;         dirty = true }
    if (!existing.bookingVisibility)          { existing.bookingVisibility = defaults.bookingVisibility; dirty = true }
    if (existing.countWeekends === undefined) { existing.countWeekends     = false;                       dirty = true }
    if (!existing.gcalTokens)                { existing.gcalTokens        = {};                          dirty = true }
    if (dirty) await kv.set(`mock:${sessionId}`, existing, { ex: SESSION_TTL_S })
    return existing
  }
  const store = createStore()
  await kv.set(`mock:${sessionId}`, store, { ex: SESSION_TTL_S })
  return store
}

export async function saveSessionStore(store: MockStore): Promise<void> {
  if (!kv) return
  const sessionId = await getSessionId()
  await kv.set(`mock:${sessionId}`, store, { ex: SESSION_TTL_S })
}
