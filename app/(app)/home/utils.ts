export { getMostRecentSunday, getTodayISO } from '@/lib/date-utils'

/** Returns the greeting phrase based on the UTC hour. */
export function getGreetingPhrase(hourUTC: number): 'morning' | 'afternoon' | 'evening' {
  if (hourUTC < 12) return 'morning'
  if (hourUTC < 17) return 'afternoon'
  return 'evening'
}

/** Returns true if dateStr matches todayStr (both YYYY-MM-DD). */
export function isToday(dateStr: string, todayStr: string): boolean {
  return dateStr === todayStr
}
