import { describe, it, expect } from 'vitest'
import { validateSuggestions, computeConfidence } from '../helpers'
import type { DaySuggestions, MealType, UserPreferences } from '@/types'

// ── T09: validateSuggestions preserves whyThisDay ────────────────────────────

describe('T09 - validateSuggestions preserves whyThisDay', () => {
  it('passes through whyThisDay field', () => {
    const days: DaySuggestions[] = [
      {
        date: '2026-04-13',
        whyThisDay: 'Quick picks for Monday',
        mealTypes: [
          { mealType: 'dinner', options: [{ recipeId: 'r1', recipeTitle: 'Test' }] },
        ],
      },
    ]
    const validIds = new Map<MealType, Set<string>>([['dinner', new Set(['r1'])]])
    const result = validateSuggestions(days, validIds)

    expect(result[0]!.whyThisDay).toBe('Quick picks for Monday')
  })

  it('preserves whyThisDay even when options are filtered out', () => {
    const days: DaySuggestions[] = [
      {
        date: '2026-04-13',
        whyThisDay: 'No seafood in weeks',
        mealTypes: [
          { mealType: 'dinner', options: [{ recipeId: 'invalid', recipeTitle: 'Fake' }] },
        ],
      },
    ]
    const validIds = new Map<MealType, Set<string>>([['dinner', new Set(['r1'])]])
    const result = validateSuggestions(days, validIds)

    expect(result[0]!.whyThisDay).toBe('No seafood in weeks')
    expect(result[0]!.mealTypes[0]!.options).toHaveLength(0)
  })

  it('handles undefined whyThisDay gracefully', () => {
    const days: DaySuggestions[] = [
      {
        date: '2026-04-13',
        mealTypes: [
          { mealType: 'dinner', options: [{ recipeId: 'r1', recipeTitle: 'Test' }] },
        ],
      },
    ]
    const validIds = new Map<MealType, Set<string>>([['dinner', new Set(['r1'])]])
    const result = validateSuggestions(days, validIds)

    expect(result[0]!.whyThisDay).toBeUndefined()
  })
})

// ── T10 & T11: Confidence score computation ──────────────────────────────────

describe('T10 - computeConfidence scoring', () => {
  const basePrefs = {
    preferredTags: ['Healthy', 'Quick'],
    seasonalRules: {
      spring: { favor: ['Garden'] },
    },
  } as unknown as UserPreferences

  it('returns base score (1) for recipe with no matching tags', () => {
    const score = computeConfidence(['Comfort'], basePrefs, 'spring', false)
    // base 20 → round(20/25) = 1
    expect(score).toBe(1)
  })

  it('adds 25 per preferred tag overlap, max 50', () => {
    const score = computeConfidence(['Healthy', 'Quick', 'Comfort'], basePrefs, 'summer', false)
    // tag overlap: 50 + base 20 = 70 → round(70/25) = 3
    expect(score).toBe(3)
  })

  it('adds 15 for seasonal match', () => {
    const score = computeConfidence(['Garden'], basePrefs, 'spring', false)
    // seasonal 15 + base 20 = 35 → round(35/25) = 1
    expect(score).toBe(1)
  })

  it('adds 15 for freeText context match', () => {
    const score = computeConfidence(['Healthy'], basePrefs, 'summer', true)
    // tag 25 + context 15 + base 20 = 60 → round(60/25) = 2
    expect(score).toBe(2)
  })

  it('combines all factors correctly', () => {
    const score = computeConfidence(['Healthy', 'Quick', 'Garden'], basePrefs, 'spring', true)
    // tag overlap: 50 (capped) + seasonal 15 + context 15 + base 20 = 100 → round(100/25) = 4
    expect(score).toBe(4)
  })
})

describe('T11 - confidenceScore is clamped to 0-4', () => {
  it('never exceeds 4 even with maximum inputs', () => {
    const prefs = {
      preferredTags: ['A', 'B', 'C', 'D', 'E'],
      seasonalRules: { spring: { favor: ['A'] } },
    } as unknown as UserPreferences
    const score = computeConfidence(['A', 'B', 'C', 'D', 'E'], prefs, 'spring', true)
    expect(score).toBeLessThanOrEqual(4)
  })

  it('returns 1 minimum for any suggestion (base score)', () => {
    const score = computeConfidence([], null, 'spring', false)
    // base 20 → round(20/25) = 1
    expect(score).toBe(1)
  })
})

// ── T08: whyThisDay is included in LLM prompt format ─────────────────────────

describe('T08 - buildSystemMessage includes whyThisDay', () => {
  it('system message contains whyThisDay format instruction', async () => {
    const { buildSystemMessage } = await import('../helpers')
    const msg = buildSystemMessage(null, [], [], 'spring')
    expect(msg).toContain('whyThisDay')
    expect(msg).toContain('one-sentence explanation')
  })
})
