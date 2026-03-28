/** Returns the ISO date string for the most recent Sunday (plan week_start). */
export function getMostRecentSunday(): string {
  const now = new Date()
  const sunday = new Date(now)
  sunday.setUTCDate(now.getUTCDate() - now.getUTCDay())
  return sunday.toISOString().slice(0, 10)
}

/** Returns today's ISO date string (YYYY-MM-DD). */
export function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Returns the greeting phrase based on the local hour. */
export function getGreetingPhrase(hourLocal: number): 'morning' | 'afternoon' | 'evening' {
  if (hourUTC < 12) return 'morning'
  if (hourUTC < 17) return 'afternoon'
  return 'evening'
}

/** Returns true if dateStr matches todayStr (both YYYY-MM-DD). */
export function isToday(dateStr: string, todayStr: string): boolean {
  return dateStr === todayStr
}
