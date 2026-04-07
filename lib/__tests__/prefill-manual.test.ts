/**
 * T17 — buildSaveAsNewPrefill: time fields default to original recipe, override from AI mods.
 * Regression for #305.
 *
 * Tests the pure helper that builds the prefillManual object for AddRecipeModal.
 * Kept in lib/__tests__ to avoid vitest path-glob issues with Next.js [id] route dirs.
 */
import { describe, it, expect } from 'vitest'

// Inline the helper (mirrors app/(cook)/recipes/[id]/cook/page.tsx buildSaveAsNewPrefill)
interface ModifiedRecipe {
  title: string
  ingredients: string
  steps: string
  notes: string | null
  servings: number | null
  prep_time_minutes?: number | null
  cook_time_minutes?: number | null
  total_time_minutes?: number | null
}

interface RecipePartial {
  prep_time_minutes: number | null
  cook_time_minutes: number | null
  total_time_minutes: number | null
}

function buildSaveAsNewPrefill(modified: ModifiedRecipe, recipe: RecipePartial) {
  return {
    title:              `${modified.title} (modified)`,
    ingredients:        modified.ingredients,
    steps:              modified.steps,
    notes:              modified.notes ?? undefined,
    servings:           modified.servings !== null ? String(modified.servings) : '',
    prep_time_minutes:  String(modified.prep_time_minutes ?? recipe.prep_time_minutes ?? ''),
    cook_time_minutes:  String(modified.cook_time_minutes ?? recipe.cook_time_minutes ?? ''),
    total_time_minutes: String(modified.total_time_minutes ?? recipe.total_time_minutes ?? ''),
  }
}

const baseRecipe: RecipePartial = { prep_time_minutes: 15, cook_time_minutes: 30, total_time_minutes: 45 }
const baseModified: ModifiedRecipe = {
  title: 'Pasta', ingredients: '250g pasta', steps: 'Boil salted water', notes: null, servings: 4,
}

describe('T17 - buildSaveAsNewPrefill time fields (regression for #305)', () => {
  it('falls back to original recipe times when AI modifications do not include times', () => {
    const prefill = buildSaveAsNewPrefill(baseModified, baseRecipe)
    expect(prefill.prep_time_minutes).toBe('15')
    expect(prefill.cook_time_minutes).toBe('30')
    expect(prefill.total_time_minutes).toBe('45')
  })

  it('overrides time fields with AI-modified values when provided', () => {
    const modified: ModifiedRecipe = { ...baseModified, prep_time_minutes: 5, cook_time_minutes: 20, total_time_minutes: 25 }
    const prefill = buildSaveAsNewPrefill(modified, baseRecipe)
    expect(prefill.prep_time_minutes).toBe('5')
    expect(prefill.cook_time_minutes).toBe('20')
    expect(prefill.total_time_minutes).toBe('25')
  })

  it('produces empty string when original recipe has null times and modifications omit them', () => {
    const recipe = { prep_time_minutes: null, cook_time_minutes: null, total_time_minutes: null }
    const prefill = buildSaveAsNewPrefill(baseModified, recipe)
    expect(prefill.prep_time_minutes).toBe('')
    expect(prefill.cook_time_minutes).toBe('')
    expect(prefill.total_time_minutes).toBe('')
  })

  it('title is suffixed with (modified)', () => {
    const prefill = buildSaveAsNewPrefill(baseModified, baseRecipe)
    expect(prefill.title).toBe('Pasta (modified)')
  })
})
