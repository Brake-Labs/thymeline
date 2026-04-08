export { getMostRecentSunday, getMostRecentWeekStart, dayNameToNumber, getTodayISO } from '@/lib/date-utils'

export type DayEntry = {
  recipeId: string
  recipeTitle: string
  totalTimeMinutes: number | null
}

/**
 * Group plan entries by plannedDate, deduplicating by recipeId within each day.
 * Only entries whose plannedDate is in `weekDays` will appear in the grid.
 */
export function buildEntriesByDay(
  entries: { plannedDate: string; recipeId: string; recipeTitle: string; totalTimeMinutes: number | null }[],
): Map<string, DayEntry[]> {
  const map = new Map<string, DayEntry[]>()
  for (const entry of entries) {
    const list = map.get(entry.plannedDate) ?? []
    if (!list.find((e) => e.recipeId === entry.recipeId)) {
      list.push({
        recipeId:          entry.recipeId,
        recipeTitle:       entry.recipeTitle,
        totalTimeMinutes: entry.totalTimeMinutes,
      })
    }
    map.set(entry.plannedDate, list)
  }
  return map
}

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
