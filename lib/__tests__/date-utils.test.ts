import { describe, it, expect } from 'vitest'
import { getMostRecentWeekStart, getMostRecentSunday } from '@/lib/date-utils'

// ── getMostRecentWeekStart ─────────────────────────────────────────────────────

describe('getMostRecentWeekStart', () => {
  describe('weekStartDay = 0 (Sunday)', () => {
    it('returns the same day when the date is already a Sunday', () => {
      // 2026-03-29 is a Sunday
      expect(getMostRecentWeekStart(0, new Date('2026-03-29T12:00:00Z'))).toBe('2026-03-29')
    })

    it('rolls back to the most recent Sunday from a mid-week day', () => {
      // 2026-04-01 is a Wednesday → previous Sunday is 2026-03-29
      expect(getMostRecentWeekStart(0, new Date('2026-04-01T12:00:00Z'))).toBe('2026-03-29')
    })

    it('rolls back one day from a Monday', () => {
      // 2026-03-30 is a Monday → previous Sunday is 2026-03-29
      expect(getMostRecentWeekStart(0, new Date('2026-03-30T12:00:00Z'))).toBe('2026-03-29')
    })

    it('rolls back from a Saturday', () => {
      // 2026-04-04 is a Saturday → previous Sunday is 2026-03-29
      expect(getMostRecentWeekStart(0, new Date('2026-04-04T12:00:00Z'))).toBe('2026-03-29')
    })
  })

  describe('weekStartDay = 1 (Monday)', () => {
    it('returns the same day when the date is already a Monday', () => {
      // 2026-03-30 is a Monday
      expect(getMostRecentWeekStart(1, new Date('2026-03-30T12:00:00Z'))).toBe('2026-03-30')
    })

    it('rolls back to the most recent Monday from a mid-week day', () => {
      // 2026-04-01 is a Wednesday → previous Monday is 2026-03-30
      expect(getMostRecentWeekStart(1, new Date('2026-04-01T12:00:00Z'))).toBe('2026-03-30')
    })

    it('rolls back from a Sunday to the preceding Monday', () => {
      // 2026-03-29 is a Sunday → preceding Monday is 2026-03-23
      expect(getMostRecentWeekStart(1, new Date('2026-03-29T12:00:00Z'))).toBe('2026-03-23')
    })

    it('rolls back from a Saturday to that week\'s Monday', () => {
      // 2026-04-04 is a Saturday → that week's Monday is 2026-03-30
      expect(getMostRecentWeekStart(1, new Date('2026-04-04T12:00:00Z'))).toBe('2026-03-30')
    })
  })

  describe('parity with getMostRecentSunday', () => {
    it('getMostRecentWeekStart(0, date) equals getMostRecentSunday(date)', () => {
      const dates = [
        new Date('2026-03-29T12:00:00Z'),  // Sunday
        new Date('2026-03-30T12:00:00Z'),  // Monday
        new Date('2026-04-01T12:00:00Z'),  // Wednesday
        new Date('2026-04-04T12:00:00Z'),  // Saturday
      ]
      for (const d of dates) {
        expect(getMostRecentWeekStart(0, d)).toBe(getMostRecentSunday(d))
      }
    })
  })
})
