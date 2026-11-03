// Who may cancel or change a booking without saying why (ADR-023).
//
// Anyone in the workspace may cancel or change any booking. 'direct' means no
// pop-up and no email to the booker; 'needs-reason' means the person must say
// "this was my meeting" or "I have their permission" (with a name), and the
// booker is emailed either way.

export const JUST_MADE_MS = 5 * 60_000

// Walk-ins and the pre-workspace tablet route book under these. Nobody reads
// them, so they never get email. A walk-in still belongs to someone (we just
// don't know who), so it gets the same questions as any other booking.
const PLACEHOLDER_EMAILS = ['walkin@tablet.spacebook.app', 'walkin@local']

export type BookingAccess = 'direct' | 'needs-reason'
export type ChangeReason = 'mine' | 'permission'

interface AccessBooking {
  booker_email: string
  created_at: string
  origin?: string | null
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && PLACEHOLDER_EMAILS.includes(email.trim().toLowerCase())
}

/** Made in the last 5 minutes, through spacebook. Google Calendar rows are
 *  excluded: their created_at is when they synced, not when someone made them. */
export function isJustMade(booking: AccessBooking, now: Date = new Date()): boolean {
  if (booking.origin === 'gcal') return false
  const age = now.getTime() - new Date(booking.created_at).getTime()
  return age >= 0 && age < JUST_MADE_MS
}

export function accessFor(
  booking: AccessBooking,
  { isAdmin, mbEmail, now = new Date() }: { isAdmin: boolean; mbEmail: string | null | undefined; now?: Date },
): BookingAccess {
  if (isAdmin) return 'direct'
  if (mbEmail && mbEmail.toLowerCase() === booking.booker_email.toLowerCase()) return 'direct'
  if (isJustMade(booking, now)) return 'direct'
  return 'needs-reason'
}

export function isChangeReason(value: unknown): value is ChangeReason {
  return value === 'mine' || value === 'permission'
}

/** Validates the reason a 'needs-reason' change must carry. Returns an error
 *  message for the client, or null when the change may go ahead. */
export function reasonError(access: BookingAccess, reason: unknown, actorName: unknown): string | null {
  if (access === 'direct') return null
  if (!isChangeReason(reason)) return 'Please say whether this is your meeting or you have the booker’s permission.'
  if (reason === 'permission' && (typeof actorName !== 'string' || !actorName.trim())) return 'Please add your name.'
  return null
}

/** The booker is told about a change only when it came with a reason, and
 *  never for a walk-in: there's no address to tell. */
export function shouldNotifyBooker(access: BookingAccess, bookerEmail: string): boolean {
  return access === 'needs-reason' && !isPlaceholderEmail(bookerEmail)
}

export function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 80) : ''
}
