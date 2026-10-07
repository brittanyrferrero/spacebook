// Client side: if the workspace has no time zone yet, offer this browser's.
// The server only accepts it when none is set (settings/time-zone route).
export function reportTimeZone(api: string, current: string | null | undefined) {
  if (current) return
  let timeZone: string | undefined
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return }
  if (!timeZone) return
  fetch(`${api}/settings/time-zone`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeZone }),
  }).catch(() => {})
}
