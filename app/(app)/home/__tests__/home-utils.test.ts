import { describe, it, expect } from 'vitest'
import { getGreetingPhrase, isToday, getMostRecentSunday, buildEntriesByDay } from '../utils'

// ── Greeting time-of-day ──────────────────────────────────────────────────────
describe('getGreetingPhrase', () => {
  it('returns morning for hours 0–11', () => {
    expect(getGreetingPhrase(0)).toBe('morning')
    expect(getGreetingPhrase(7)).toBe('morning')
    expect(getGreetingPhrase(11)).toBe('morning')
  })

  it('returns afternoon for hours 12–16', () => {
    expect(getGreetingPhrase(12)).toBe('afternoon')
    expect(getGreetingPhrase(14)).toBe('afternoon')
    expect(getGreetingPhrase(16)).toBe('afternoon')
  })

  it('returns evening for hours 17–23', () => {
    expect(getGreetingPhrase(17)).toBe('evening')
    expect(getGreetingPhrase(20)).toBe('evening')
    expect(getGreetingPhrase(23)).toBe('evening')
  })
})

// ── Week card today highlight ─────────────────────────────────────────────────
describe('isToday', () => {
  it('returns true when dateStr matches todayStr', () => {
    expect(isToday('2025-06-10', '2025-06-10')).toBe(true)
  })

  it('returns false when dateStr does not match todayStr', () => {
    expect(isToday('2025-06-10', '2025-06-11')).toBe(false)
    expect(isToday('2025-06-10', '2025-06-09')).toBe(false)
  })
})

// ── buildEntriesByDay — regression for #315 ──────────────────────────────────
// Bug: the dashboard queried meal plans without a weekStart filter, so entries
// from a different week were returned. Those entries had dates outside the
// current week grid, so no meals were displayed and the day count was wrong.
describe('buildEntriesByDay', () => {
  const makeEntry = (plannedDate: string, recipeId: string, recipeTitle = 'Recipe', totalTimeMinutes: number | null = null) =>
    ({ plannedDate, recipeId, recipeTitle, totalTimeMinutes })

  it('returns an empty map for no entries', () => {
    expect(buildEntriesByDay([]).size).toBe(0)
  })

  it('groups entries by plannedDate', () => {
    const entries = [
      makeEntry('2026-04-06', 'r1', 'Pasta'),
      makeEntry('2026-04-07', 'r2', 'Soup'),
      makeEntry('2026-04-08', 'r3', 'Pizza'),
    ]
    const map = buildEntriesByDay(entries)
    expect(map.size).toBe(3)
    expect(map.get('2026-04-06')?.[0]?.recipeTitle).toBe('Pasta')
    expect(map.get('2026-04-07')?.[0]?.recipeTitle).toBe('Soup')
    expect(map.get('2026-04-08')?.[0]?.recipeTitle).toBe('Pizza')
  })

  it('deduplicates the same recipeId within the same day', () => {
    const entries = [
      makeEntry('2026-04-06', 'r1', 'Pasta'),
      makeEntry('2026-04-06', 'r1', 'Pasta'),  // duplicate
    ]
    const map = buildEntriesByDay(entries)
    expect(map.get('2026-04-06')).toHaveLength(1)
  })

  it('does NOT deduplicate the same recipe across different days', () => {
    const entries = [
      makeEntry('2026-04-06', 'r1', 'Pasta'),
      makeEntry('2026-04-08', 'r1', 'Pasta'),
    ]
    const map = buildEntriesByDay(entries)
    expect(map.size).toBe(2)
    expect(map.get('2026-04-06')).toHaveLength(1)
    expect(map.get('2026-04-08')).toHaveLength(1)
  })

  it('entries from outside the current week are not mixed into current-week days', () => {
    // Simulates the pre-fix behaviour: old plan entries have dates outside the
    // current week. Those dates simply won't appear when the grid iterates
    // current-week dates — verifying the lookup returns undefined.
    const entries = [
      makeEntry('2025-01-06', 'r1', 'Old Pasta'),  // from an old plan
    ]
    const map = buildEntriesByDay(entries)
    // Current-week dates (e.g. 2026-04-06) must not have any entries
    expect(map.get('2026-04-06')).toBeUndefined()
    expect(map.size).toBe(1)  // only old date present
  })
})

// ── Empty plan state ──────────────────────────────────────────────────────────
describe('getMostRecentSunday', () => {
  it('returns a YYYY-MM-DD string', () => {
    const result = getMostRecentSunday()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns a Sunday (day index 0 in UTC)', () => {
    const result = getMostRecentSunday()
    const d = new Date(`${result}T00:00:00Z`)
    expect(d.getUTCDay()).toBe(0)
  })

  it('returns today or a past date (never future)', () => {
    const result = getMostRecentSunday()
    const resultMs = new Date(`${result}T00:00:00Z`).getTime()
    const nowMs = Date.now()
    expect(resultMs).toBeLessThanOrEqual(nowMs)
  })
})
