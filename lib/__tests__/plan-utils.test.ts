/**
 * Tests for lib/plan-utils.ts
 * Covers spec-22: T20
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/household', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scopeQuery: (query: any) => query,
}))

vi.mock('@/lib/date-utils', () => ({
  getMostRecentSunday: () => '2026-03-30',
}))

import { getPlanWasteBadgeText, fetchCurrentWeekPlan } from '@/lib/plan-utils'

describe('getPlanWasteBadgeText', () => {
  it('T20a: returns empty string when matches is empty', () => {
    expect(getPlanWasteBadgeText([])).toBe('')
  })

  it('T20b: single match returns "Uses up your {ingredient}"', () => {
    expect(getPlanWasteBadgeText([{ ingredient: 'spinach', waste_risk: 'high' }]))
      .toBe('Uses up your spinach')
  })

  it('T20c: two matches returns "Uses up 2 ingredients"', () => {
    expect(getPlanWasteBadgeText([
      { ingredient: 'spinach', waste_risk: 'high' },
      { ingredient: 'feta',   waste_risk: 'medium' },
    ])).toBe('Uses up 2 ingredients')
  })

  it('T20d: three or more matches returns "Uses up N ingredients"', () => {
    expect(getPlanWasteBadgeText([
      { ingredient: 'spinach', waste_risk: 'high' },
      { ingredient: 'feta',   waste_risk: 'medium' },
      { ingredient: 'lemon',  waste_risk: 'medium' },
    ])).toBe('Uses up 3 ingredients')
  })
})

describe('fetchCurrentWeekPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('T20: returns empty array when no plan exists', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const mockDb = {
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    } as unknown as Parameters<typeof fetchCurrentWeekPlan>[1]

    const result = await fetchCurrentWeekPlan('user-1', mockDb, null)
    expect(result).toEqual([])
  })
})
