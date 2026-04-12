import { describe, it, expect } from 'vitest'
import { matchStepIngredients } from '@/components/cook/StepIngredientPanel'

// ── T72: StepIngredientPanel matching parity — last-word fallback ────────────

describe('T72 - matchStepIngredients uses last-word fallback', () => {
  it('matches "olive oil" when step text only says "oil"', () => {
    const result = matchStepIngredients(
      'heat oil in pan',
      '2 tbsp olive oil',
      4,
      4,
    )
    expect(result).toEqual(['2 tbsp olive oil'])
  })
})

// ── T73: StepIngredientPanel matching parity — ambiguity guard ──────────────

describe('T73 - matchStepIngredients suppresses ambiguous last-word fallback', () => {
  it('returns empty when "sauce" is ambiguous between soy sauce and fish sauce', () => {
    const result = matchStepIngredients(
      'add the sauce to the pan',
      '1/4 cup soy sauce\n2 tbsp fish sauce',
      4,
      4,
    )
    expect(result).toEqual([])
  })
})
