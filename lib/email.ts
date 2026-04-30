import { Resend } from 'resend'

const FROM = process.env.EMAIL_FROM ?? 'spacebook <noreply@spacebook.app>'

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

  const cancelUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/cancel/${cancelToken}`

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
