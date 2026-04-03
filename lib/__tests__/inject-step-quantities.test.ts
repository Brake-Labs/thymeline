import { describe, it, expect } from 'vitest'
import { injectStepQuantities } from '@/lib/inject-step-quantities'

// ── T50: Ingredient names replaced with quantity + name, highlights recorded ──

describe('T50 - ingredient names replaced with scaled quantity + name', () => {
  it('replaces flour and butter with their quantities and records highlight ranges', () => {
    const result = injectStepQuantities(
      'combine flour and butter',
      '2 cups flour\n1/2 cup butter',
      4,
      4,
    )
    expect(result.text).toBe('combine 2 cups flour and 1/2 cup butter')
    // Two quantity spans highlighted
    expect(result.highlights).toHaveLength(2)
    // First highlight covers "2 cups"
    const firstSpan = result.text.slice(result.highlights[0]!.start, result.highlights[0]!.end)
    expect(firstSpan).toBe('2 cups')
    // Second highlight covers "1/2 cup"
    const secondSpan = result.text.slice(result.highlights[1]!.start, result.highlights[1]!.end)
    expect(secondSpan).toBe('1/2 cup')
  })
})

// ── T51: Step with no ingredient references renders unchanged ─────────────────

describe('T51 - step with no ingredient references renders unchanged', () => {
  it('returns original text and empty highlights when no names match', () => {
    const result = injectStepQuantities(
      'Preheat the oven to 350 degrees',
      '2 cups flour\n1/2 tsp salt',
      4,
      4,
    )
    expect(result.text).toBe('Preheat the oven to 350 degrees')
    expect(result.highlights).toHaveLength(0)
  })
})

// ── T52: Scaled quantities reflect current servings ───────────────────────────

describe('T52 - scaled quantities reflect current servings', () => {
  it('doubles quantity when servings is 2× the original', () => {
    const result = injectStepQuantities(
      'add flour to the bowl',
      '2 cups flour',
      8,
      4,
    )
    expect(result.text).toBe('add 4 cups flour to the bowl')
    expect(result.highlights).toHaveLength(1)
    const span = result.text.slice(result.highlights[0]!.start, result.highlights[0]!.end)
    expect(span).toBe('4 cups')
  })
})

// ── T53: Same ingredient twice in one step — both occurrences highlighted ─────

describe('T53 - same ingredient appearing twice gets both occurrences highlighted', () => {
  it('injects quantity before each occurrence and records two highlight ranges', () => {
    const result = injectStepQuantities(
      'mix flour until the flour is smooth',
      '2 cups flour',
      4,
      4,
    )
    expect(result.text).toBe('mix 2 cups flour until the 2 cups flour is smooth')
    expect(result.highlights).toHaveLength(2)
    for (const h of result.highlights) {
      expect(result.text.slice(h.start, h.end)).toBe('2 cups')
    }
  })
})

// ── T54: Timer phrase — "cook" is not treated as an ingredient ────────────────

describe('T54 - "cook" in timer phrase is not matched as an ingredient', () => {
  it('leaves "cook for 20 minutes" unchanged when "cook" is not in the ingredient list', () => {
    const result = injectStepQuantities(
      'cook for 20 minutes',
      '2 cups flour\n1/2 tsp salt',
      4,
      4,
    )
    expect(result.text).toBe('cook for 20 minutes')
    expect(result.highlights).toHaveLength(0)
  })
})

// ── T55: Comma-descriptor ingredients match on pre-comma name ─────────────────

describe('T55 - ingredient with comma descriptor matches pre-comma name in step', () => {
  it('highlights "3 cloves" before "garlic" when ingredient is "3 cloves garlic, minced"', () => {
    const result = injectStepQuantities(
      'add garlic to the pan',
      '3 cloves garlic, minced',
      4,
      4,
    )
    expect(result.text).toBe('add 3 cloves garlic to the pan')
    expect(result.highlights).toHaveLength(1)
    const span = result.text.slice(result.highlights[0]!.start, result.highlights[0]!.end)
    expect(span).toBe('3 cloves')
  })
})
