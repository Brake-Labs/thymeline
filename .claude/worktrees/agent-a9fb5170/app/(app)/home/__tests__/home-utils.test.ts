import { describe, it, expect } from 'vitest'
import { getGreetingPhrase, isToday, getMostRecentSunday } from '../utils'

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
