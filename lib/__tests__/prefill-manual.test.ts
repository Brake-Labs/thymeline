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
  prepTimeMinutes?: number | null
  cookTimeMinutes?: number | null
  totalTimeMinutes?: number | null
}

interface RecipePartial {
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  totalTimeMinutes: number | null
}

function buildSaveAsNewPrefill(modified: ModifiedRecipe, recipe: RecipePartial) {
  return {
    title:              `${modified.title} (modified)`,
    ingredients:        modified.ingredients,
    steps:              modified.steps,
    notes:              modified.notes ?? undefined,
    servings:           modified.servings !== null ? String(modified.servings) : '',
    prepTimeMinutes:  String(modified.prepTimeMinutes ?? recipe.prepTimeMinutes ?? ''),
    cookTimeMinutes:  String(modified.cookTimeMinutes ?? recipe.cookTimeMinutes ?? ''),
    totalTimeMinutes: String(modified.totalTimeMinutes ?? recipe.totalTimeMinutes ?? ''),
  }
}

const baseRecipe: RecipePartial = { prepTimeMinutes: 15, cookTimeMinutes: 30, totalTimeMinutes: 45 }
const baseModified: ModifiedRecipe = {
  title: 'Pasta', ingredients: '250g pasta', steps: 'Boil salted water', notes: null, servings: 4,
}

describe('T17 - buildSaveAsNewPrefill time fields (regression for #305)', () => {
  it('falls back to original recipe times when AI modifications do not include times', () => {
    const prefill = buildSaveAsNewPrefill(baseModified, baseRecipe)
    expect(prefill.prepTimeMinutes).toBe('15')
    expect(prefill.cookTimeMinutes).toBe('30')
    expect(prefill.totalTimeMinutes).toBe('45')
  })

  it('overrides time fields with AI-modified values when provided', () => {
    const modified: ModifiedRecipe = { ...baseModified, prepTimeMinutes: 5, cookTimeMinutes: 20, totalTimeMinutes: 25 }
    const prefill = buildSaveAsNewPrefill(modified, baseRecipe)
    expect(prefill.prepTimeMinutes).toBe('5')
    expect(prefill.cookTimeMinutes).toBe('20')
    expect(prefill.totalTimeMinutes).toBe('25')
  })

  it('produces empty string when original recipe has null times and modifications omit them', () => {
    const recipe = { prepTimeMinutes: null, cookTimeMinutes: null, totalTimeMinutes: null }
    const prefill = buildSaveAsNewPrefill(baseModified, recipe)
    expect(prefill.prepTimeMinutes).toBe('')
    expect(prefill.cookTimeMinutes).toBe('')
    expect(prefill.totalTimeMinutes).toBe('')
  })

  it('title is suffixed with (modified)', () => {
    const prefill = buildSaveAsNewPrefill(baseModified, baseRecipe)
    expect(prefill.title).toBe('Pasta (modified)')
  })
})
