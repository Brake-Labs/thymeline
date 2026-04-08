export { getMostRecentSunday, getMostRecentWeekStart, dayNameToNumber, getTodayISO } from '@/lib/date-utils'

export type DayEntry = {
  recipe_id: string
  recipe_title: string
  total_time_minutes: number | null
}

/**
 * Group plan entries by planned_date, deduplicating by recipe_id within each day.
 * Only entries whose planned_date is in `weekDays` will appear in the grid.
 */
export function buildEntriesByDay(
  entries: { planned_date: string; recipe_id: string; recipe_title: string; total_time_minutes: number | null }[],
): Map<string, DayEntry[]> {
  const map = new Map<string, DayEntry[]>()
  for (const entry of entries) {
    const list = map.get(entry.planned_date) ?? []
    if (!list.find((e) => e.recipe_id === entry.recipe_id)) {
      list.push({
        recipe_id:          entry.recipe_id,
        recipe_title:       entry.recipe_title,
        total_time_minutes: entry.total_time_minutes,
      })
    }
    map.set(entry.planned_date, list)
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
