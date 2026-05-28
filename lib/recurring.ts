import type { RecurringFrequency } from '@/types'

function nthWeekdayOfMonth(year: number, month: number, jsDay: number, n: number): Date | null {
  const firstDow = new Date(year, month, 1).getDay()
  const firstOccurrence = 1 + ((jsDay - firstDow + 7) % 7)
  const date = firstOccurrence + (n - 1) * 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  if (date > daysInMonth) return null
  return new Date(year, month, date)
}

export function generateOccurrenceDates(
  frequency: RecurringFrequency,
  daysOfWeek: number[] | null,
  seriesStart: string,
  seriesEnd: string,
): Date[] {
  const start = new Date(seriesStart + 'T00:00:00')
  const end = new Date(seriesEnd + 'T23:59:59')
  const dates: Date[] = []

  if (frequency === 'monthly') {
    const jsDay = start.getDay()
    const ordinal = Math.ceil(start.getDate() / 7)
    let cur: Date | null = new Date(start)
    while (cur && cur <= end) {
      dates.push(new Date(cur))
      let nextMonth = cur.getMonth() + 1
      let nextYear = cur.getFullYear()
      if (nextMonth > 11) { nextMonth = 0; nextYear++ }
      cur = nthWeekdayOfMonth(nextYear, nextMonth, jsDay, ordinal)
    }
    return dates
  }

  const jsDays = (daysOfWeek ?? []).map(d => (d === 7 ? 0 : d))
  const stepDays = frequency === 'biweekly' ? 14 : 7

  const weekStart = new Date(start)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())

  const week = new Date(weekStart)
  while (week <= end) {
    for (const jsDow of jsDays) {
      const occ = new Date(week)
      occ.setDate(week.getDate() + jsDow)
      if (occ >= start && occ <= end) dates.push(new Date(occ))
    }
    week.setDate(week.getDate() + stepDays)
  }

  return dates.sort((a, b) => a.getTime() - b.getTime())
}
