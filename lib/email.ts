import { Resend } from 'resend'
import { isPlaceholderEmail } from '@/lib/booking-access'

// RFC 5321 practical email validation — rejects obviously invalid addresses
export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

const FROM = process.env.EMAIL_FROM ?? 'spacebook <noreply@spacebook.app>'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Single canonical app URL — falls back through both env vars so either works.
// Set NEXT_PUBLIC_APP_URL (or NEXT_PUBLIC_BASE_URL) in Vercel; keep them in sync.
// Uses || not ?? so empty-string values don't silently produce broken URLs.
export const appUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export async function sendGcalConflictEmail({
  timeZone,
  to,
  organizerName,
  roomName,
  startTime,
  endTime,
  eventTitle,
}: {
  timeZone?: string | null   // workspace time zone; UTC if unknown
  to: string
  organizerName: string
  roomName: string
  startTime: string
  endTime: string
  eventTitle: string | null
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const resend = new Resend(key)

  const date = fmtDate(startTime, timeZone)
  const time = fmtTimeRange(startTime, endTime, timeZone)
  const firstName = organizerName.split(' ')[0]

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your ${roomName} event could not be added`,
    html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">Booking conflict</div>

  <p style="font-size:14px;color:#374151">Hi ${firstName},</p>
  <p style="font-size:14px;color:#374151">
    Your event${eventTitle ? ` <strong>${eventTitle}</strong>` : ''} could not be added to <strong>${roomName}</strong> — that time is already booked in spacebook.
  </p>

  <div style="background:#FEF2F2;border-radius:8px;padding:14px 16px;margin:20px 0;font-size:13px;color:#374151">
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">Room</span> &nbsp; ${roomName}</div>
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">Date</span> &nbsp; ${date}</div>
    <div><span style="color:#9CA3AF">Time</span> &nbsp; ${time}</div>
  </div>

  <p style="font-size:13px;color:#6B7280">
    Please book through spacebook to reserve this room.
  </p>
</div>`,
  })
}

// Email times are shown in the workspace's time zone (cfg:timezone, set from the
// first browser that opens the workspace or in admin Settings). Without one they
// fall back to UTC and say so, rather than silently using the server's zone.
function zone(timeZone?: string | null) {
  if (!timeZone) return 'UTC'
  try { new Intl.DateTimeFormat('en-US', { timeZone }); return timeZone } catch { return 'UTC' }
}

/** "Tuesday, October 6" */
export function fmtDate(iso: string, timeZone?: string | null) {
  return new Date(iso).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: zone(timeZone) })
}

/** "3:00 – 4:00 PM PDT" (both ends shown in full when they straddle noon) */
export function fmtTimeRange(startIso: string, endIso: string, timeZone?: string | null) {
  const tz = zone(timeZone)
  const parts = (iso: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short' })
    .formatToParts(new Date(iso))
  const pick = (ps: Intl.DateTimeFormatPart[], t: string) => ps.find(p => p.type === t)?.value ?? ''
  const a = parts(startIso), b = parts(endIso)
  const clock = (ps: Intl.DateTimeFormatPart[]) => `${pick(ps, 'hour')}:${pick(ps, 'minute')}`
  const startStr = pick(a, 'dayPeriod') === pick(b, 'dayPeriod') ? clock(a) : `${clock(a)} ${pick(a, 'dayPeriod')}`
  return `${startStr} – ${clock(b)} ${pick(b, 'dayPeriod')} ${pick(b, 'timeZoneName')}`
}

/** Calendar date (YYYY-MM-DD) in the given zone, for "did the day change?" checks */
function localDay(iso: string, timeZone?: string | null) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: zone(timeZone) })
}

function editedIntro({ editorName, editorEmail, reason }: { editorName: string; editorEmail?: string; reason?: 'mine' | 'permission' }) {
  if (reason === 'mine') return 'You changed'
  const who = `<strong>${escapeHtml(editorName)}</strong>${editorEmail ? ` (${escapeHtml(editorEmail)})` : ''}`
  if (reason === 'permission') return `${who} changed, saying they had your permission,`
  return `${who} made changes to`
}

export async function sendBookingEditedEmail({
  timeZone,
  to,
  bookerName,
  editorName,
  editorEmail,
  reason,
  roomName,
  oldStartTime,
  oldEndTime,
  newStartTime,
  newEndTime,
  title,
  cancelToken,
}: {
  timeZone?: string | null   // workspace time zone; UTC if unknown
  to: string
  bookerName: string
  editorName: string
  editorEmail?: string
  // ADR-023: set when someone changed another person's booking and said why
  reason?: 'mine' | 'permission'
  roomName: string
  oldStartTime: string
  oldEndTime: string
  newStartTime: string
  newEndTime: string
  title: string | null
  cancelToken: string
}) {
  if (isPlaceholderEmail(to)) return   // walk-ins: nobody reads these
  const key = process.env.RESEND_API_KEY
  if (!key) return

  const resend = new Resend(key)

  const dateChanged = localDay(oldStartTime, timeZone) !== localDay(newStartTime, timeZone)
  const timeChanged = oldStartTime !== newStartTime || oldEndTime !== newEndTime

  const oldDate = fmtDate(oldStartTime, timeZone)
  const newDate = fmtDate(newStartTime, timeZone)
  const oldTime = fmtTimeRange(oldStartTime, oldEndTime, timeZone)
  const newTime = fmtTimeRange(newStartTime, newEndTime, timeZone)

  const cancelUrl = `${appUrl()}/cancel/${cancelToken}`

  const changes: string[] = []
  if (dateChanged) changes.push(`Date: <s style="color:#999">${oldDate}</s> → <strong>${newDate}</strong>`)
  if (timeChanged && !dateChanged) changes.push(`Time: <s style="color:#999">${oldTime}</s> → <strong>${newTime}</strong>`)
  if (timeChanged && dateChanged) changes.push(`Time: <strong>${newTime}</strong>`)

  const html = `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">Booking updated</div>

  <p style="font-size:14px;color:#374151">Hi ${escapeHtml(bookerName.split(' ')[0])},</p>
  <p style="font-size:14px;color:#374151">
    ${editedIntro({ editorName, editorEmail, reason })} your booking for <strong>${escapeHtml(roomName)}</strong>${title ? ` — <em>${escapeHtml(title)}</em>` : ''}.
  </p>

  ${changes.length > 0 ? `
  <div style="background:#F8F8F6;border-radius:8px;padding:14px 16px;margin:20px 0;font-size:13px;color:#374151">
    ${changes.map(c => `<div style="margin-bottom:6px">${c}</div>`).join('')}
  </div>` : ''}

  <div style="background:#F8F8F6;border-radius:8px;padding:14px 16px;margin:20px 0;font-size:13px;color:#374151">
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">Room</span> &nbsp; ${escapeHtml(roomName)}</div>
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">Date</span> &nbsp; ${newDate}</div>
    <div><span style="color:#9CA3AF">Time</span> &nbsp; ${newTime}</div>
  </div>

  <p style="font-size:13px;color:#6B7280">
    ${reason === 'mine'
      ? `Whoever made this change said it was their meeting. If that wasn't you, you can <a href="${cancelUrl}" style="color:#C0392B">cancel this booking</a> or rebook the original time.`
      : `If this wasn't expected, you can <a href="${cancelUrl}" style="color:#C0392B">cancel this booking</a>.`}
  </p>
</div>`

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your ${roomName} booking has been updated`,
    html,
  })
}

export async function sendPalantirMagicLink({ to, url }: { to: string; url: string }) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const resend = new Resend(key)
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Your palantir access link',
    html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">palantir access</div>
  <p style="font-size:14px;color:#374151">Here's your link to the palantir dashboard:</p>
  <div style="margin:24px 0">
    <a href="${url}" style="display:inline-block;padding:10px 20px;background:#090d18;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500">
      Open palantir
    </a>
  </div>
  <p style="font-size:12px;color:#9CA3AF">This link expires in 15 minutes. If you didn't request this, ignore it.</p>
</div>`,
  })
}

export async function sendWorkspaceDeleteRequestEmail({
  to,
  workspaceName,
  requesterEmail,
  url,
}: {
  to: string
  workspaceName: string
  requesterEmail: string
  url: string
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const resend = new Resend(key)
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Confirm deletion request for ${workspaceName}`,
    html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">Workspace deletion request</div>
  <p style="font-size:14px;color:#374151">
    A deletion request was submitted for <strong>${workspaceName}</strong> by <strong>${requesterEmail}</strong>.
  </p>
  <p style="font-size:14px;color:#374151">
    Click below to confirm. Once confirmed, the request will appear in the spacebook admin queue for review — nothing is deleted automatically.
  </p>
  <div style="margin:24px 0">
    <a href="${url}" style="display:inline-block;padding:10px 20px;background:#7f1d1d;color:#fca5a5;text-decoration:none;font-size:14px;font-weight:500">
      Confirm deletion request
    </a>
  </div>
  <p style="font-size:12px;color:#9CA3AF">This link expires in 24 hours. If you didn't request this, you can ignore it — nothing will happen unless this is confirmed.</p>
</div>`,
  })
}

export async function sendMyBookingsMagicLink({
  to,
  url,
  workspace,
}: {
  to: string
  url: string
  workspace: string
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const resend = new Resend(key)
  await resend.emails.send({
    from: FROM,
    to,
    subject: `View your bookings — ${workspace}`,
    html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">My bookings</div>
  <p style="font-size:14px;color:#374151">Click below to view and manage your bookings for <strong>${workspace}</strong>:</p>
  <div style="margin:24px 0">
    <a href="${url}" style="display:inline-block;padding:10px 20px;background:#C0577C;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500">
      View my bookings
    </a>
  </div>
  <p style="font-size:12px;color:#9CA3AF">This link is valid for 7 days. If you didn't request this, you can ignore it.</p>
</div>`,
  })
}

export async function sendBlockRebookedEmail({
  timeZone,
  to,
  bookerName,
  originalRoomName,
  newRoomName,
  startTime,
  endTime,
  reason,
  workspaceSlug,
}: {
  timeZone?: string | null   // workspace time zone; UTC if unknown
  to: string
  bookerName: string
  originalRoomName: string
  newRoomName: string
  startTime: string
  endTime: string
  reason?: string
  workspaceSlug: string
}) {
  if (isPlaceholderEmail(to)) return   // walk-ins: nobody reads these
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const resend = new Resend(key)

  const firstName = bookerName.split(' ')[0]
  const date = fmtDate(startTime, timeZone)
  const time = fmtTimeRange(startTime, endTime, timeZone)
  const workspaceUrl = `${appUrl()}/${workspaceSlug}`
  const reasonText = reason ?? 'scheduled maintenance'

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your ${originalRoomName} booking has been moved to ${newRoomName}`,
    html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">Booking moved</div>

  <p style="font-size:14px;color:#374151">Hi ${firstName},</p>
  <p style="font-size:14px;color:#374151">
    Your booking for <strong>${originalRoomName}</strong> on ${date} at ${time} has been moved to <strong>${newRoomName}</strong> due to ${reasonText}.
    Your new booking details are the same — just a different room.
  </p>

  <div style="background:#F8F8F6;border-radius:8px;padding:14px 16px;margin:20px 0;font-size:13px;color:#374151">
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">New room</span> &nbsp; ${newRoomName}</div>
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">Date</span> &nbsp; ${date}</div>
    <div><span style="color:#9CA3AF">Time</span> &nbsp; ${time}</div>
  </div>

  <p style="font-size:13px;color:#6B7280">
    Visit <a href="${workspaceUrl}" style="color:#2C3E6B">${workspaceUrl}</a> to view your bookings.
  </p>
</div>`,
  })
}

export async function sendBlockCancelledEmail({
  timeZone,
  to,
  bookerName,
  roomName,
  startTime,
  endTime,
  reason,
  workspaceSlug,
}: {
  timeZone?: string | null   // workspace time zone; UTC if unknown
  to: string
  bookerName: string
  roomName: string
  startTime: string
  endTime: string
  reason?: string
  workspaceSlug: string
}) {
  if (isPlaceholderEmail(to)) return   // walk-ins: nobody reads these
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const resend = new Resend(key)

  const firstName = bookerName.split(' ')[0]
  const date = fmtDate(startTime, timeZone)
  const time = fmtTimeRange(startTime, endTime, timeZone)
  const workspaceUrl = `${appUrl()}/${workspaceSlug}`
  const reasonPhrase = reason ? ` due to ${reason}` : ''

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your ${roomName} booking has been cancelled`,
    html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">Booking cancelled</div>

  <p style="font-size:14px;color:#374151">Hi ${firstName},</p>
  <p style="font-size:14px;color:#374151">
    Your booking for <strong>${roomName}</strong> on ${date} at ${time} has been cancelled — the room is unavailable${reasonPhrase} and no equivalent room was free at that time.
  </p>

  <div style="background:#FEF2F2;border-radius:8px;padding:14px 16px;margin:20px 0;font-size:13px;color:#374151">
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">Room</span> &nbsp; ${roomName}</div>
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">Date</span> &nbsp; ${date}</div>
    <div><span style="color:#9CA3AF">Time</span> &nbsp; ${time}</div>
  </div>

  <p style="font-size:13px;color:#6B7280">
    Visit <a href="${workspaceUrl}" style="color:#2C3E6B">${workspaceUrl}</a> to find another time.
  </p>
</div>`,
  })
}

export async function sendFindMyWorkspacesEmail({
  to,
  workspaces,
}: {
  to: string
  workspaces: { name: string; slug: string; role: string | null; workspaceUrl: string; adminUrl?: string }[]
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const resend = new Resend(key)

  const bodyHtml = workspaces.length === 0
    ? `<p style="font-size:14px;color:#6B7280">We couldn't find any Spacebook workspaces associated with <strong>${escapeHtml(to)}</strong>. If you think this is a mistake, reach out to your workspace admin.</p>`
    : workspaces.map(ws => {
        const roleLabel = ws.role === 'super_admin' ? 'Super Admin' : ws.role === 'admin' ? 'Admin' : 'Member'
        const roleBg    = ws.role ? '#EEF1FB' : '#F3F4F6'
        const roleColor = ws.role ? '#2C3E6B' : '#6B7280'
        const safeName  = escapeHtml(ws.name)
        const safeWsUrl = escapeHtml(ws.workspaceUrl)
        const safeAdminUrl = ws.adminUrl ? escapeHtml(ws.adminUrl) : null
        return `
<div style="background:#F8F8F6;border-radius:8px;padding:16px;margin:12px 0">
  <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px">
    <span style="font-size:15px;font-weight:600;color:#111">${safeName}</span>
    <span style="font-size:11px;color:${roleColor};background:${roleBg};padding:3px 8px;border-radius:20px;white-space:nowrap">${roleLabel}</span>
  </div>
  <div>
    <a href="${safeWsUrl}" style="display:inline-block;padding:8px 16px;background:#090d18;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;margin-right:8px">Visit workspace</a>
    ${safeAdminUrl ? `<a href="${safeAdminUrl}" style="display:inline-block;padding:8px 16px;background:#2C3E6B;color:#fff;text-decoration:none;border-radius:6px;font-size:13px">Open admin panel</a>` : ''}
  </div>
</div>`
      }).join('')

  const hasAdminLinks = workspaces.some(w => w.adminUrl)

  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Your Spacebook workspaces',
    html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">Your workspaces</div>

  <p style="font-size:14px;color:#374151;margin-bottom:4px">
    Here are the Spacebook workspaces associated with <strong>${escapeHtml(to)}</strong>:
  </p>

  ${bodyHtml}

  ${hasAdminLinks ? '<p style="font-size:12px;color:#9CA3AF;margin-top:20px">Admin sign-in links expire in 1 hour.</p>' : ''}
</div>`,
  })
}

export async function sendGcalSyncHealthEmail({
  to,
  rooms,
}: {
  to: string
  rooms: { roomName: string; workspaceSlug: string; workspaceName: string | null; reason: string }[]
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const resend = new Resend(key)

  const rows = rooms.map(r => `
  <div style="background:#FEF2F2;border-radius:8px;padding:14px 16px;margin:12px 0;font-size:13px;color:#374151">
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">Room</span> &nbsp; ${escapeHtml(r.roomName)}</div>
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">Workspace</span> &nbsp; ${escapeHtml(r.workspaceName ?? r.workspaceSlug)}</div>
    <div><span style="color:#9CA3AF">Issue</span> &nbsp; ${escapeHtml(r.reason)}</div>
  </div>`).join('')

  await resend.emails.send({
    from: FROM,
    to,
    subject: `spacebook: ${rooms.length} room${rooms.length === 1 ? '' : 's'} not syncing with Google Calendar`,
    html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">GCal sync health check</div>

  <p style="font-size:14px;color:#374151">
    The daily sync-health check found ${rooms.length} room${rooms.length === 1 ? '' : 's'} where Google Calendar sync looks broken — external calendar changes on these rooms are not reaching spacebook.
  </p>

  ${rows}

  <p style="font-size:13px;color:#6B7280">
    Standard fix: in each workspace's admin panel, disconnect and reconnect Google Calendar for the affected room. See the <code>gcal-not-syncing</code> runbook for diagnosis steps.
  </p>
</div>`,
  })
}

export async function sendAdminRecoveryEmail({
  to,
  workspace,
  url,
}: {
  to: string
  workspace: string
  url: string
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const resend = new Resend(key)

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your spacebook admin link for ${workspace}`,
    html: `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">Admin access</div>

  <p style="font-size:14px;color:#374151">Here's your admin link for <strong>${workspace}</strong>:</p>

  <div style="margin:24px 0">
    <a href="${url}" style="display:inline-block;padding:10px 20px;background:#2C3E6B;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500">
      Open admin panel
    </a>
  </div>

  <p style="font-size:12px;color:#9CA3AF">
    If you didn't request this, you can ignore this email. This link does not expire.
  </p>
</div>`,
  })
}

// ─── ADR-023: changes by someone other than the booker ──────────────────────

function emailShell(label: string, body: string) {
  return `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">${label}</div>
${body}
</div>`
}

function bookingCard(roomName: string, startTime: string, endTime: string, timeZone: string | null | undefined, tint = '#F8F8F6') {
  const date = fmtDate(startTime, timeZone)
  const time = fmtTimeRange(startTime, endTime, timeZone)
  return `
  <div style="background:${tint};border-radius:8px;padding:14px 16px;margin:20px 0;font-size:13px;color:#374151">
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">Room</span> &nbsp; ${escapeHtml(roomName)}</div>
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">Date</span> &nbsp; ${date}</div>
    <div><span style="color:#9CA3AF">Time</span> &nbsp; ${time}</div>
  </div>`
}

const p = (html: string, muted = false) =>
  `  <p style="font-size:${muted ? 13 : 14}px;color:${muted ? '#6B7280' : '#374151'}">${html}</p>`

/** Sent to the booker when someone else cancelled their booking and said why. */
export async function sendBookingCancelledNoticeEmail({
  timeZone,
  to, bookerName, reason, actorName, roomName, startTime, endTime, title, count, workspaceSlug,
}: {
  timeZone?: string | null   // workspace time zone; UTC if unknown
  to: string
  bookerName: string
  reason: 'mine' | 'permission'
  actorName: string
  roomName: string
  startTime: string
  endTime: string
  title: string | null
  count: number          // >1 when the rest of a recurring series was cancelled too
  workspaceSlug: string
}) {
  if (isPlaceholderEmail(to)) return   // walk-ins: nobody reads these
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const resend = new Resend(key)

  const what = `your booking for <strong>${escapeHtml(roomName)}</strong>${title ? ` — <em>${escapeHtml(title)}</em>` : ''}${count > 1 ? ` and the ${count - 1} after it in the series` : ''}`
  const workspaceUrl = `${appUrl()}/${workspaceSlug}`
  const body = reason === 'mine'
    ? [
        p(`Hi ${escapeHtml(bookerName.split(' ')[0])},`),
        p(`You cancelled ${what}.`),
        bookingCard(roomName, startTime, endTime, timeZone, '#FEF2F2'),
        p(`Whoever cancelled it said it was their meeting. If that wasn't you, <a href="${workspaceUrl}" style="color:#2C3E6B">book the time again</a> if it's still free.`, true),
      ]
    : [
        p(`Hi ${escapeHtml(bookerName.split(' ')[0])},`),
        p(`<strong>${escapeHtml(actorName)}</strong> cancelled ${what}, saying they had your permission.`),
        bookingCard(roomName, startTime, endTime, timeZone, '#FEF2F2'),
        p(`If you didn't agree to this, <a href="${workspaceUrl}" style="color:#2C3E6B">book the time again</a> if it's still free.`, true),
      ]

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your ${roomName} booking was cancelled`,
    html: emailShell('Booking cancelled', body.join('\n')),
  })
}

/** "Ask them to cancel or change it": one email to the booker (Reply-To the
 *  requester, with the one-click cancel link) and a copy to the requester
 *  (no cancel link, no booker email address). */
export async function sendBookingRequestEmail({
  timeZone,
  bookerEmail, bookerName, requesterName, requesterEmail, note, kind, roomName, startTime, endTime, title, cancelToken,
}: {
  timeZone?: string | null   // workspace time zone; UTC if unknown
  bookerEmail: string
  bookerName: string
  requesterName: string
  requesterEmail: string
  note: string
  kind: 'cancel' | 'change'
  roomName: string
  startTime: string
  endTime: string
  title: string | null
  cancelToken: string
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const resend = new Resend(key)

  const ask = kind === 'cancel' ? 'cancel' : 'change'
  const booking = `your booking for <strong>${escapeHtml(roomName)}</strong>${title ? ` — <em>${escapeHtml(title)}</em>` : ''}`
  const noteHtml = note
    ? `  <div style="border-left:3px solid #D1D5DB;padding:4px 12px;margin:16px 0;font-size:14px;color:#374151;white-space:pre-wrap">${escapeHtml(note)}</div>`
    : ''
  const cancelUrl = `${appUrl()}/cancel/${cancelToken}`

  await resend.emails.send({
    from: FROM,
    to: bookerEmail,
    replyTo: requesterEmail,
    subject: `${requesterName} asked you to ${ask} your ${roomName} booking`,
    html: emailShell('Request about your booking', [
      p(`Hi ${escapeHtml(bookerName.split(' ')[0])},`),
      p(`<strong>${escapeHtml(requesterName)}</strong> (${escapeHtml(requesterEmail)}) asked you to ${ask} ${booking}.`),
      noteHtml,
      bookingCard(roomName, startTime, endTime, timeZone),
      p(`Nothing has changed yet. <a href="${cancelUrl}" style="color:#C0392B">Cancel this booking</a>, or reply to this email to talk to ${escapeHtml(requesterName.split(' ')[0])}. If you cancel or move it, please let them know.`, true),
    ].join('\n')),
  })

  // requesterEmail is whatever was typed, unverified, so this receipt carries
  // nothing they wrote (no note, no name): nobody can send their own text to
  // someone else's inbox from us.
  await resend.emails.send({
    from: FROM,
    to: requesterEmail,
    subject: `Your request about the ${roomName} booking was sent`,
    html: emailShell('Request sent', [
      p(`Hi,`),
      p(`We asked ${escapeHtml(bookerName)} to ${ask} their booking for <strong>${escapeHtml(roomName)}</strong>.`),
      bookingCard(roomName, startTime, endTime, timeZone),
      p(`They can reply to you directly.`, true),
    ].join('\n')),
  })
}
