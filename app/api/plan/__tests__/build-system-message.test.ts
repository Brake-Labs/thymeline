import { describe, it, expect, vi } from 'vitest'

// Mock the Anthropic SDK to prevent import errors (helpers.ts instantiates it at module level)
vi.mock('@anthropic-ai/sdk', () => ({
  default: function MockAnthropic() {
    // no-op
  },
}))

import { buildSystemMessage, getSeason } from '@/app/api/plan/helpers'
import type { UserPreferences, LimitedTag } from '@/types'

// ── Factory for UserPreferences ─────────────────────────────────────────────

function makePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    id: 'pref-1',
    user_id: 'user-1',
    options_per_day: 3,
    cooldown_days: 28,
    seasonal_mode: false,
    preferred_tags: [],
    avoided_tags: [],
    limited_tags: [],
    seasonal_rules: null,
    onboarding_completed: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ── getSeason() ─────────────────────────────────────────────────────────────

describe('getSeason', () => {
  it('returns winter for December (12), January (1), February (2)', () => {
    expect(getSeason(12)).toBe('winter')
    expect(getSeason(1)).toBe('winter')
    expect(getSeason(2)).toBe('winter')
  })

  it('returns spring for March (3), April (4), May (5)', () => {
    expect(getSeason(3)).toBe('spring')
    expect(getSeason(4)).toBe('spring')
    expect(getSeason(5)).toBe('spring')
  })

  it('returns summer for June (6), July (7), August (8)', () => {
    expect(getSeason(6)).toBe('summer')
    expect(getSeason(7)).toBe('summer')
    expect(getSeason(8)).toBe('summer')
  })

  it('returns autumn for September (9), October (10), November (11)', () => {
    expect(getSeason(9)).toBe('autumn')
    expect(getSeason(10)).toBe('autumn')
    expect(getSeason(11)).toBe('autumn')
  })
})

// ── buildSystemMessage() with default/minimal preferences ───────────────────

describe('buildSystemMessage', () => {
  it('produces a valid system prompt with default/minimal preferences', () => {
    const result = buildSystemMessage(makePrefs(), [], [], 'winter')

    expect(result).toContain('You are a meal planning assistant')
    expect(result).toContain('Return exactly 3 options per day')
    expect(result).toContain('avoided tags: none')
    expect(result).toContain('preferred tags: none')
    expect(result).toContain('weekly tag caps: none')
    expect(result).toContain('Current season is winter')
  })

  it('handles null preferences gracefully (uses defaults)', () => {
    const result = buildSystemMessage(null, [], [], 'spring')

    expect(result).toContain('Return exactly 3 options per day')
    expect(result).toContain('avoided tags: none')
    expect(result).toContain('preferred tags: none')
    expect(result).toContain('weekly tag caps: none')
    expect(result).toContain('Current season is spring')
  })

  // ── Avoided tags ────────────────────────────────────────────────────────

  it('includes avoided tags from user preferences', () => {
    const prefs = makePrefs({ avoided_tags: ['Spicy', 'Grill'] })
    const result = buildSystemMessage(prefs, [], [], 'summer')

    expect(result).toContain('avoided tags: Spicy, Grill')
  })

  it('includes session-level avoided tags', () => {
    const result = buildSystemMessage(makePrefs(), [], ['Seafood'], 'summer')

    expect(result).toContain('avoided tags: Seafood')
  })

  it('merges preference and session avoided tags without duplicates', () => {
    const prefs = makePrefs({ avoided_tags: ['Spicy', 'Grill'] })
    const result = buildSystemMessage(prefs, [], ['Grill', 'Seafood'], 'summer')

    // Should contain all three unique tags
    expect(result).toContain('Spicy')
    expect(result).toContain('Grill')
    expect(result).toContain('Seafood')
    // "Grill" should only appear once in the avoided tags section
    const avoidedMatch = result.match(/avoided tags: (.+)/)
    expect(avoidedMatch).not.toBeNull()
    const avoidedList = avoidedMatch![1].split(', ')
    const grillCount = avoidedList.filter((t) => t === 'Grill').length
    expect(grillCount).toBe(1)
  })

  // ── Preferred tags ──────────────────────────────────────────────────────

  it('includes preferred tags from user preferences', () => {
    const prefs = makePrefs({ preferred_tags: ['Healthy', 'Quick'] })
    const result = buildSystemMessage(prefs, [], [], 'winter')

    expect(result).toContain('preferred tags: Healthy, Quick')
  })

  it('includes session-level preferred tags', () => {
    const result = buildSystemMessage(makePrefs(), ['Mediterranean'], [], 'winter')

    expect(result).toContain('preferred tags: Mediterranean')
  })

  it('merges preference and session preferred tags without duplicates', () => {
    const prefs = makePrefs({ preferred_tags: ['Healthy'] })
    const result = buildSystemMessage(prefs, ['Healthy', 'Grill'], [], 'summer')

    // "Healthy" appears in both pref and session — should be deduplicated
    expect(result).toContain('preferred tags: Healthy, Grill')
    // Verify "Healthy" only appears once in the preferred tags portion
    const preferredLine = result.split('\n').find((l) => l.includes('preferred tags:'))!
    const occurrences = preferredLine.split('Healthy').length - 1
    expect(occurrences).toBe(1)
  })

  // ── Limited tags (weekly tag caps) ──────────────────────────────────────

  it('includes limited tags with their caps', () => {
    const limitedTags: LimitedTag[] = [
      { tag: 'Comfort', cap: 2 },
      { tag: 'Soup', cap: 3 },
    ]
    const prefs = makePrefs({ limited_tags: limitedTags })
    const result = buildSystemMessage(prefs, [], [], 'winter')

    expect(result).toContain('Comfort: max 2/week')
    expect(result).toContain('Soup: max 3/week')
  })

  it('shows "none" when limited_tags is an empty array', () => {
    const prefs = makePrefs({ limited_tags: [] })
    const result = buildSystemMessage(prefs, [], [], 'winter')

    expect(result).toContain('weekly tag caps: none')
  })

  // ── Seasonal instructions ───────────────────────────────────────────────

  it('includes seasonal instructions when seasonal_mode is ON with winter rules', () => {
    const prefs = makePrefs({
      seasonal_mode: true,
      seasonal_rules: {
        winter: {
          favor: ['Soup', 'Sheet Pan'],
          cap: { Soup: 2, 'Sheet Pan': 2 },
          exclude: ['Grill'],
        },
      },
    })
    const result = buildSystemMessage(prefs, [], [], 'winter')

    expect(result).toContain('Favor Soup, Sheet Pan recipes')
    expect(result).toContain('Cap Soup at 2 total across the week')
    expect(result).toContain('Cap Sheet Pan at 2 total across the week')
    expect(result).toContain('Exclude Grill recipes')
  })

  it('includes seasonal instructions when seasonal_mode is ON with summer rules', () => {
    const prefs = makePrefs({
      seasonal_mode: true,
      seasonal_rules: {
        summer: {
          favor: ['Grill'],
          cap: { Grill: 2 },
          exclude: [],
        },
      },
    })
    const result = buildSystemMessage(prefs, [], [], 'summer')

    expect(result).toContain('Current season is summer')
    expect(result).toContain('Favor Grill recipes')
    expect(result).toContain('Cap Grill at 2 total across the week')
    // Empty exclude array should not produce an "Exclude" instruction
    expect(result).not.toContain('Exclude')
  })

  it('ignores seasonal rules when seasonal_mode is OFF', () => {
    const prefs = makePrefs({
      seasonal_mode: false,
      seasonal_rules: {
        winter: {
          favor: ['Soup'],
          cap: { Soup: 2 },
          exclude: ['Grill'],
        },
      },
    })
    const result = buildSystemMessage(prefs, [], [], 'winter')

    // Season is still mentioned in the base message
    expect(result).toContain('Current season is winter')
    // But the seasonal instructions should NOT be present
    expect(result).not.toContain('Favor Soup')
    expect(result).not.toContain('Cap Soup')
    expect(result).not.toContain('Exclude Grill')
  })

  it('handles seasonal_mode ON but no rules for the current season', () => {
    const prefs = makePrefs({
      seasonal_mode: true,
      seasonal_rules: {
        summer: { favor: ['Grill'], cap: {}, exclude: [] },
      },
    })
    // Current season is winter but rules only define summer
    const result = buildSystemMessage(prefs, [], [], 'winter')

    expect(result).toContain('Current season is winter')
    expect(result).not.toContain('Favor')
  })

  it('handles seasonal_mode ON with null seasonal_rules', () => {
    const prefs = makePrefs({
      seasonal_mode: true,
      seasonal_rules: null,
    })
    const result = buildSystemMessage(prefs, [], [], 'autumn')

    expect(result).toContain('Current season is autumn')
    // No seasonal instructions appended
    expect(result).not.toContain('Favor')
    expect(result).not.toContain('Exclude')
  })

  // ── options_per_day ─────────────────────────────────────────────────────

  it('uses custom options_per_day value', () => {
    const prefs = makePrefs({ options_per_day: 5 })
    const result = buildSystemMessage(prefs, [], [], 'spring')

    expect(result).toContain('Return exactly 5 options per day')
  })

  it('defaults to 3 options_per_day when prefs is null', () => {
    const result = buildSystemMessage(null, [], [], 'spring')

    expect(result).toContain('Return exactly 3 options per day')
  })

  it('uses options_per_day of 1', () => {
    const prefs = makePrefs({ options_per_day: 1 })
    const result = buildSystemMessage(prefs, [], [], 'summer')

    expect(result).toContain('Return exactly 1 options per day')
  })

  // ── All constraints combined ────────────────────────────────────────────

  it('correctly combines all constraints in one prompt', () => {
    const prefs = makePrefs({
      options_per_day: 4,
      preferred_tags: ['Healthy'],
      avoided_tags: ['Spicy'],
      limited_tags: [{ tag: 'Comfort', cap: 2 }],
      seasonal_mode: true,
      seasonal_rules: {
        autumn: {
          favor: ['Soup'],
          cap: { Soup: 3 },
          exclude: ['Grill'],
        },
      },
    })
    const result = buildSystemMessage(prefs, ['Quick'], ['Seafood'], 'autumn')

    // options_per_day
    expect(result).toContain('Return exactly 4 options per day')
    // avoided: pref "Spicy" + session "Seafood"
    expect(result).toContain('Spicy')
    expect(result).toContain('Seafood')
    // preferred: pref "Healthy" + session "Quick"
    expect(result).toContain('Healthy')
    expect(result).toContain('Quick')
    // limited tags
    expect(result).toContain('Comfort: max 2/week')
    // seasonal
    expect(result).toContain('Current season is autumn')
    expect(result).toContain('Favor Soup recipes')
    expect(result).toContain('Cap Soup at 3 total across the week')
    expect(result).toContain('Exclude Grill recipes')
    // Structural elements
    expect(result).toContain('Return ONLY valid JSON')
    expect(result).toContain('Never suggest the same recipe for more than one day')
  })

  // ── Empty arrays (no preferred, no avoided, no limited) ─────────────────

  it('shows "none" for all constraint types when all arrays are empty', () => {
    const prefs = makePrefs({
      preferred_tags: [],
      avoided_tags: [],
      limited_tags: [],
    })
    const result = buildSystemMessage(prefs, [], [], 'spring')

    expect(result).toContain('avoided tags: none')
    expect(result).toContain('preferred tags: none')
    expect(result).toContain('weekly tag caps: none')
  })

  // ── JSON output format instruction ──────────────────────────────────────

  it('always includes JSON output format instructions', () => {
    const result = buildSystemMessage(makePrefs(), [], [], 'winter')

    expect(result).toContain('Return ONLY valid JSON in this exact format')
    expect(result).toContain('"recipe_id"')
    expect(result).toContain('"recipe_title"')
    expect(result).toContain('"reason"')
    expect(result).toContain('"days"')
    expect(result).toContain('"meal_types"')
  })

  // ── Season is always stated ─────────────────────────────────────────────

  it('states the current season in all cases', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      const result = buildSystemMessage(makePrefs(), [], [], season)
      expect(result).toContain(`Current season is ${season}`)
    }
  })
})
