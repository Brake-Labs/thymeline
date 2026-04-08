// ── Date / week utilities ────────────────────────────────────────────────────
// Single source of truth — all date formatting uses UTC to avoid timezone bugs.

/** Convert a Date to "YYYY-MM-DD" in UTC. */
export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Return today's date as "YYYY-MM-DD" in UTC. */
export function getTodayISO(): string {
  return toDateString(new Date())
}

/**
 * Return the most-recent occurrence of `weekStartDay` (0 = Sun … 6 = Sat)
 * at or before `date` as "YYYY-MM-DD".
 */
export function getMostRecentWeekStart(weekStartDay: number, date: Date = new Date()): string {
  const d = new Date(date)
  const diff = (d.getUTCDay() - weekStartDay + 7) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return toDateString(d)
}

/** Return the most-recent Sunday (week_start) as "YYYY-MM-DD". */
export function getMostRecentSunday(date: Date = new Date()): string {
  return getMostRecentWeekStart(0, date)
}

/** Convert a DB day-name string ('sunday'…'saturday') to a weekday number (0–6). */
const DAY_NAMES_ORDERED = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
export function dayNameToNumber(name: string): number {
  const idx = DAY_NAMES_ORDERED.indexOf(name as typeof DAY_NAMES_ORDERED[number])
  return idx >= 0 ? idx : 0
}

/** Add N days to a "YYYY-MM-DD" string, returning a new date string. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return toDateString(d)
}

/** Add N weeks to a "YYYY-MM-DD" string, returning a new date string. */
export function addWeeks(dateStr: string, weeks: number): string {
  return addDays(dateStr, weeks * 7)
}

/** Return the 7 date strings for a week starting at weekStart. */
export function getWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

/**
 * Format a week range as "Mar 1 – Mar 7".
 * Uses en-US locale with UTC timezone.
 */
export function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${fmt(start)} \u2013 ${fmt(end)}`
}

/** Format a date range as "Mar 1 – Mar 14". */
export function formatDateRange(from: string, to: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  return `${start.toLocaleDateString('en-US', opts)} \u2013 ${end.toLocaleDateString('en-US', opts)}`
}

/** Short weekday abbreviation, e.g. "Mon". */
export function getDayAbbrev(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', timeZone: 'UTC',
  })
}

/** Day number only, e.g. "14". */
export function getDayNum(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
    day: 'numeric', timeZone: 'UTC',
  })
}

/** "Mar 14" — short month + day. */
export function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

/** "Monday, Mar 14" — long weekday + short date. */
export function formatDayName(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

/** "Monday" — long weekday only. */
export function formatWeekday(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', timeZone: 'UTC',
  })
}

/** Check if dateStr matches today (local time comparison). */
export function isTodayLocal(dateStr: string): boolean {
  const today = new Date()
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return dateStr === local
}

/** Check if a date string is a Sunday. */
export function isSunday(dateStr: string): boolean {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay() === 0
}
