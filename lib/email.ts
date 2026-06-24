import { Resend } from 'resend'

// RFC 5321 practical email validation — rejects obviously invalid addresses
export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

const FROM = process.env.EMAIL_FROM ?? 'spacebook <noreply@spacebook.app>'

// Single canonical app URL — falls back through both env vars so either works.
// Set NEXT_PUBLIC_APP_URL (or NEXT_PUBLIC_BASE_URL) in Vercel; keep them in sync.
// Uses || not ?? so empty-string values don't silently produce broken URLs.
export const appUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

export async function sendGcalConflictEmail({
  to,
  organizerName,
  roomName,
  startTime,
  endTime,
  eventTitle,
}: {
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

  const date = fmt(startTime, { weekday: 'long', day: 'numeric', month: 'long' })
  const time = `${fmt(startTime, { hour: '2-digit', minute: '2-digit' })} – ${fmt(endTime, { hour: '2-digit', minute: '2-digit' })}`
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

function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleString('en-AU', opts)
}

export async function sendBookingEditedEmail({
  to,
  bookerName,
  editorName,
  editorEmail,
  roomName,
  oldStartTime,
  oldEndTime,
  newStartTime,
  newEndTime,
  title,
  cancelToken,
}: {
  to: string
  bookerName: string
  editorName: string
  editorEmail: string
  roomName: string
  oldStartTime: string
  oldEndTime: string
  newStartTime: string
  newEndTime: string
  title: string | null
  cancelToken: string
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return

  const resend = new Resend(key)

  const dateChanged = oldStartTime.slice(0, 10) !== newStartTime.slice(0, 10)
  const timeChanged = oldStartTime !== newStartTime || oldEndTime !== newEndTime

  const oldDate = fmt(oldStartTime, { weekday: 'long', day: 'numeric', month: 'long' })
  const newDate = fmt(newStartTime, { weekday: 'long', day: 'numeric', month: 'long' })
  const oldTime = `${fmt(oldStartTime, { hour: '2-digit', minute: '2-digit' })} – ${fmt(oldEndTime, { hour: '2-digit', minute: '2-digit' })}`
  const newTime = `${fmt(newStartTime, { hour: '2-digit', minute: '2-digit' })} – ${fmt(newEndTime, { hour: '2-digit', minute: '2-digit' })}`

  const cancelUrl = `${appUrl()}/cancel/${cancelToken}`

  const changes: string[] = []
  if (dateChanged) changes.push(`Date: <s style="color:#999">${oldDate}</s> → <strong>${newDate}</strong>`)
  if (timeChanged && !dateChanged) changes.push(`Time: <s style="color:#999">${oldTime}</s> → <strong>${newTime}</strong>`)
  if (timeChanged && dateChanged) changes.push(`Time: <strong>${newTime}</strong>`)

  const html = `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:18px;font-weight:600;color:#2C3E6B;margin-bottom:4px">spacebook</div>
  <div style="font-size:13px;color:#9CA3AF;margin-bottom:24px">Booking updated</div>

  <p style="font-size:14px;color:#374151">Hi ${bookerName.split(' ')[0]},</p>
  <p style="font-size:14px;color:#374151">
    <strong>${editorName}</strong> (${editorEmail}) made changes to your booking for <strong>${roomName}</strong>${title ? ` — <em>${title}</em>` : ''}.
  </p>

  ${changes.length > 0 ? `
  <div style="background:#F8F8F6;border-radius:8px;padding:14px 16px;margin:20px 0;font-size:13px;color:#374151">
    ${changes.map(c => `<div style="margin-bottom:6px">${c}</div>`).join('')}
  </div>` : ''}

  <div style="background:#F8F8F6;border-radius:8px;padding:14px 16px;margin:20px 0;font-size:13px;color:#374151">
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">Room</span> &nbsp; ${roomName}</div>
    <div style="margin-bottom:6px"><span style="color:#9CA3AF">Date</span> &nbsp; ${newDate}</div>
    <div><span style="color:#9CA3AF">Time</span> &nbsp; ${newTime}</div>
  </div>

  <p style="font-size:13px;color:#6B7280">
    If this wasn't expected, you can <a href="${cancelUrl}" style="color:#C0392B">cancel this booking</a>.
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
  to,
  bookerName,
  originalRoomName,
  newRoomName,
  startTime,
  endTime,
  reason,
  workspaceSlug,
}: {
  to: string
  bookerName: string
  originalRoomName: string
  newRoomName: string
  startTime: string
  endTime: string
  reason?: string
  workspaceSlug: string
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const resend = new Resend(key)

  const firstName = bookerName.split(' ')[0]
  const date = fmt(startTime, { weekday: 'long', day: 'numeric', month: 'long' })
  const time = `${fmt(startTime, { hour: '2-digit', minute: '2-digit' })} – ${fmt(endTime, { hour: '2-digit', minute: '2-digit' })}`
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
  to,
  bookerName,
  roomName,
  startTime,
  endTime,
  reason,
  workspaceSlug,
}: {
  to: string
  bookerName: string
  roomName: string
  startTime: string
  endTime: string
  reason?: string
  workspaceSlug: string
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const resend = new Resend(key)

  const firstName = bookerName.split(' ')[0]
  const date = fmt(startTime, { weekday: 'long', day: 'numeric', month: 'long' })
  const time = `${fmt(startTime, { hour: '2-digit', minute: '2-digit' })} – ${fmt(endTime, { hour: '2-digit', minute: '2-digit' })}`
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
