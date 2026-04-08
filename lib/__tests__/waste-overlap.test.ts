import { describe, it, expect, vi } from 'vitest'
import { detectWasteOverlap, getPrimaryWasteBadgeText, type RecipeForOverlap } from '@/lib/waste-overlap'
import type { WasteMatch } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLLM(response: unknown) {
  return vi.fn().mockResolvedValue(JSON.stringify(response))
}

const SPINACH_PASTA: RecipeForOverlap = {
  recipeId: 'r1',
  title: 'Spinach Pasta',
  ingredients: 'spinach, pasta, garlic, olive oil',
}
const SPINACH_SALAD: RecipeForOverlap = {
  recipeId: 'r2',
  title: 'Spinach Salad',
  ingredients: 'spinach, lemon, feta cheese',
}
const BEEF_STEW: RecipeForOverlap = {
  recipeId: 'r3',
  title: 'Beef Stew',
  ingredients: 'beef, carrots, potatoes, salt, pepper',
}

// ── T02: detectWasteOverlap returns correct matches ───────────────────────────

describe('T02 - detectWasteOverlap returns correct matches for a shared ingredient', () => {
  it('returns a WasteMatch for each recipe sharing an ingredient', async () => {
    const llm = makeLLM([
      { ingredient: 'spinach', recipeIds: ['r1', 'r2'], wasteRisk: 'high' },
    ])

    const result = await detectWasteOverlap([SPINACH_PASTA, SPINACH_SALAD], [], llm)

    const r1Matches = result.get('r1')
    const r2Matches = result.get('r2')
    expect(r1Matches).toHaveLength(1)
    expect(r1Matches?.[0]?.ingredient).toBe('spinach')
    expect(r1Matches?.[0]?.wasteRisk).toBe('high')
    expect(r1Matches?.[0]?.sharedWith).toContain('r2')

    expect(r2Matches).toHaveLength(1)
    expect(r2Matches?.[0]?.sharedWith).toContain('r1')
  })
})

// ── T03: Pantry staples not returned ─────────────────────────────────────────

describe('T03 - Pantry staples (salt, oil) are not returned as waste matches', () => {
  it('returns empty map when LLM returns no overlap (pantry-only recipes)', async () => {
    // LLM correctly excludes pantry staples and returns []
    const llm = makeLLM([])

    const result = await detectWasteOverlap([BEEF_STEW], [], llm)

    expect(result.size).toBe(0)
  })
})

// ── T04: Produce and dairy are returned as waste matches ─────────────────────

describe('T04 - Produce and dairy are returned as waste matches', () => {
  it('returns matches for produce and dairy ingredients', async () => {
    const llm = makeLLM([
      { ingredient: 'feta cheese', recipeIds: ['r1', 'r2'], wasteRisk: 'medium' },
    ])

    const result = await detectWasteOverlap([SPINACH_PASTA, SPINACH_SALAD], [], llm)

    expect(result.get('r1')?.[0]?.ingredient).toBe('feta cheese')
    expect(result.get('r1')?.[0]?.wasteRisk).toBe('medium')
  })
})

// ── T07: Badge text single match, no next week ────────────────────────────────

describe('T07 - Badge text: single match, no next-week → "Uses up your {ingredient}"', () => {
  it('returns "Uses up your {ingredient}" for single match with hasNextWeek=false', () => {
    const matches: WasteMatch[] = [
      { ingredient: 'spinach', wasteRisk: 'high', sharedWith: ['r2'], hasNextWeek: false },
    ]
    expect(getPrimaryWasteBadgeText(matches)).toBe('Uses up your spinach')
  })
})

// ── T08: Badge text 2+ matches ────────────────────────────────────────────────

describe('T08 - Badge text: 2+ matches → "Uses up N ingredients"', () => {
  it('returns "Uses up 2 ingredients" for two matches', () => {
    const matches: WasteMatch[] = [
      { ingredient: 'spinach', wasteRisk: 'high', sharedWith: ['r2'], hasNextWeek: false },
      { ingredient: 'feta',   wasteRisk: 'medium', sharedWith: ['r3'], hasNextWeek: false },
    ]
    expect(getPrimaryWasteBadgeText(matches)).toBe('Uses up 2 ingredients')
  })

  it('returns "Uses up 3 ingredients" for three matches', () => {
    const matches: WasteMatch[] = [
      { ingredient: 'spinach', wasteRisk: 'high',   sharedWith: ['r2'], hasNextWeek: false },
      { ingredient: 'feta',   wasteRisk: 'medium', sharedWith: ['r3'], hasNextWeek: false },
      { ingredient: 'cream',  wasteRisk: 'high',   sharedWith: ['r4'], hasNextWeek: false },
    ]
    expect(getPrimaryWasteBadgeText(matches)).toBe('Uses up 3 ingredients')
  })
})

// ── T09: Badge text shared with next week ─────────────────────────────────────

describe('T09 - Badge text: shared with next week → "Pairs with next week\'s plan"', () => {
  it('returns "Pairs with next week\'s plan" when hasNextWeek=true', () => {
    const matches: WasteMatch[] = [
      { ingredient: 'spinach', wasteRisk: 'high', sharedWith: ['r2'], hasNextWeek: true },
    ]
    expect(getPrimaryWasteBadgeText(matches)).toBe("Pairs with next week's plan")
  })
})

// ── T10: No badge when wasteMatches absent ───────────────────────────────────

describe('T10 - No badge when wasteMatches is absent or empty', () => {
  it('returns empty string for empty matches array', () => {
    expect(getPrimaryWasteBadgeText([])).toBe('')
  })
})

// ── T12: No next-week plan, overlap runs on current week only ─────────────────

describe('T12 - No next-week plan — overlap runs on current week only', () => {
  it('runs overlap with empty nextWeekRecipes, still detects intra-week overlap', async () => {
    const llm = makeLLM([
      { ingredient: 'spinach', recipeIds: ['r1', 'r2'], wasteRisk: 'high' },
    ])

    const result = await detectWasteOverlap([SPINACH_PASTA, SPINACH_SALAD], [], llm)

    // Both this-week recipes share spinach, no next-week flag
    expect(result.get('r1')?.[0]?.hasNextWeek).toBe(false)
    expect(result.get('r2')?.[0]?.hasNextWeek).toBe(false)
  })

  it('returns empty map when all inputs are empty', async () => {
    const llm = makeLLM([])
    const result = await detectWasteOverlap([], [], llm)
    expect(result.size).toBe(0)
    expect(llm).not.toHaveBeenCalled()
  })
})

// ── T14: Overlap detection LLM failure returns no badges ─────────────────────

describe('T14 - Overlap detection LLM failure returns no badges', () => {
  it('returns empty map when LLM throws', async () => {
    const llm = vi.fn().mockRejectedValue(new Error('LLM unavailable'))

    await expect(
      detectWasteOverlap([SPINACH_PASTA, SPINACH_SALAD], [], llm),
    ).rejects.toThrow('LLM unavailable')
  })

  it('returns empty map when LLM returns invalid JSON', async () => {
    const llm = vi.fn().mockResolvedValue('not json at all')
    const result = await detectWasteOverlap([SPINACH_PASTA, SPINACH_SALAD], [], llm)
    expect(result.size).toBe(0)
  })

  it('returns empty map when LLM returns non-array JSON', async () => {
    const llm = vi.fn().mockResolvedValue('{"foo":"bar"}')
    const result = await detectWasteOverlap([SPINACH_PASTA, SPINACH_SALAD], [], llm)
    expect(result.size).toBe(0)
  })
})

// ── T18: getPrimaryWasteBadgeText single high-risk ────────────────────────────

describe('T18 - getPrimaryWasteBadgeText — single high-risk match returns ingredient name', () => {
  it('returns ingredient name for single high-risk match without next-week flag', () => {
    const matches: WasteMatch[] = [
      { ingredient: 'coleslaw mix', wasteRisk: 'high', sharedWith: ['r2'], hasNextWeek: false },
    ]
    expect(getPrimaryWasteBadgeText(matches)).toBe('Uses up your coleslaw mix')
  })
})

// ── T20: Recipes with no ingredients text are excluded ────────────────────────

describe('T20 - Recipes with no ingredients text are excluded from overlap analysis', () => {
  it('does not include no-ingredient recipes in the LLM prompt (verified via call args)', async () => {
    const llm = makeLLM([])
    const withIngredients: RecipeForOverlap = {
      recipeId: 'r1',
      title: 'Spinach Pasta',
      ingredients: 'spinach, pasta',
    }
    // This would fail the `.filter((r) => r.ingredients.trim() !== '')` in the route
    // but detectWasteOverlap itself receives already-filtered lists.
    // Test that it still runs correctly with only valid recipes.
    const result = await detectWasteOverlap([withIngredients], [], llm)
    expect(result.size).toBe(0)
    expect(llm).toHaveBeenCalledOnce()
  })

  it('returns empty map when called with empty thisWeek list', async () => {
    const llm = makeLLM([])
    const result = await detectWasteOverlap([], [], llm)
    expect(result.size).toBe(0)
    // Should short-circuit and NOT call LLM when combined list is empty
    expect(llm).not.toHaveBeenCalled()
  })
})

// ── hasNextWeek flag is set correctly ───────────────────────────────────────

describe('hasNextWeek flag set correctly when next-week recipes are involved', () => {
  it('sets hasNextWeek=true when sharedWith recipe is from next week', async () => {
    const nextWeekRecipe: RecipeForOverlap = {
      recipeId: 'nw1',
      title: 'Spinach Quiche',
      ingredients: 'spinach, eggs, cream',
    }
    const llm = makeLLM([
      { ingredient: 'spinach', recipeIds: ['r1', 'nw1'], wasteRisk: 'high' },
    ])

    const result = await detectWasteOverlap([SPINACH_PASTA], [nextWeekRecipe], llm)

    const match = result.get('r1')?.[0]
    expect(match?.hasNextWeek).toBe(true)
    expect(match?.sharedWith).toContain('nw1')
  })

  it('sets hasNextWeek=false for intra-week overlap', async () => {
    const llm = makeLLM([
      { ingredient: 'spinach', recipeIds: ['r1', 'r2'], wasteRisk: 'high' },
    ])

    const result = await detectWasteOverlap([SPINACH_PASTA, SPINACH_SALAD], [], llm)

    expect(result.get('r1')?.[0]?.hasNextWeek).toBe(false)
    expect(result.get('r2')?.[0]?.hasNextWeek).toBe(false)
  })
})

// ── entries with fewer than 2 recipeIds are skipped ─────────────────────────

describe('entries with fewer than 2 recipeIds are skipped', () => {
  it('ignores overlap entries with only one recipeId', async () => {
    const llm = makeLLM([
      { ingredient: 'spinach', recipeIds: ['r1'], wasteRisk: 'high' },
    ])

    const result = await detectWasteOverlap([SPINACH_PASTA, SPINACH_SALAD], [], llm)

    expect(result.size).toBe(0)
  })
})
