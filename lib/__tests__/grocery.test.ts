/**
 * Tests for lib/grocery.ts utility functions.
 * Covers spec test cases: T08, T09, T10, T11, T12, T13
 */

import { describe, it, expect } from 'vitest'
import {
  parseIngredientLine,
  normalizeIngredientName,
  assignSection,
  isPantryStaple,
  combineIngredients,
  scaleItem,
  effectiveServings,
  buildPlainTextList,
  getCurrentWeekSunday,
  formatWeekLabel,
} from '../grocery'
import type { GroceryItem, RecipeScale } from '@/types'

// ── parseIngredientLine ───────────────────────────────────────────────────────

describe('parseIngredientLine', () => {
  it('parses amount + unit + name', () => {
    const result = parseIngredientLine('2 cups chopped onion')
    expect(result.amount).toBe(2)
    expect(result.unit).toBe('cups')
    expect(result.name).toContain('onion')
  })

  it('parses fraction amount', () => {
    const result = parseIngredientLine('1/2 tsp salt')
    expect(result.amount).toBeCloseTo(0.5)
    expect(result.unit).toBe('tsp')
  })

  it('parses mixed number', () => {
    const result = parseIngredientLine('1½ cups flour')
    expect(result.amount).toBeCloseTo(1.5)
    expect(result.unit).toBe('cups')
  })

  it('parses no amount (just name)', () => {
    const result = parseIngredientLine('salt to taste')
    expect(result.amount).toBeNull()
  })

  it('strips parenthetical notes', () => {
    const result = parseIngredientLine('2 oz pancetta (or bacon)')
    expect(result.name).not.toContain('(')
    expect(result.name).not.toContain('bacon')
  })

  it('handles range amounts (takes lower bound)', () => {
    const result = parseIngredientLine('2-3 cloves garlic')
    expect(result.amount).toBe(2)
  })
})

// ── normalizeIngredientName ───────────────────────────────────────────────────

describe('normalizeIngredientName', () => {
  it('lowercases and singularizes simple plurals', () => {
    expect(normalizeIngredientName('Onions')).toBe('onion')
    expect(normalizeIngredientName('Eggs')).toBe('egg')
    expect(normalizeIngredientName('Cloves')).toBe('clove')
  })
})

// ── assignSection ─────────────────────────────────────────────────────────────

describe('assignSection', () => {
  it('assigns Produce to tomato', () => {
    expect(assignSection('tomato')).toBe('Produce')
  })

  it('assigns Proteins to chicken', () => {
    expect(assignSection('chicken breast')).toBe('Proteins')
  })

  it('assigns Dairy & Eggs to cream', () => {
    expect(assignSection('heavy cream')).toBe('Dairy & Eggs')
  })

  it('assigns Pantry to olive oil', () => {
    expect(assignSection('olive oil')).toBe('Pantry')
  })

  it('assigns Canned & Jarred to canned tomatoes', () => {
    expect(assignSection('canned tomatoes')).toBe('Canned & Jarred')
  })

  it('assigns Bakery to bread', () => {
    expect(assignSection('sourdough bread')).toBe('Bakery')
  })

  it('assigns Frozen to frozen peas', () => {
    expect(assignSection('frozen peas')).toBe('Frozen')
  })

  it('assigns Other to unknown ingredient', () => {
    expect(assignSection('xylograph sauce')).toBe('Other')
  })

  it('assigns Canned & Jarred to "2 cans fire roasted diced tomatoes"', () => {
    expect(assignSection('2 cans fire roasted diced tomatoes')).toBe('Canned & Jarred')
  })

  it('assigns Canned & Jarred to "1 can coconut milk"', () => {
    expect(assignSection('1 can coconut milk')).toBe('Canned & Jarred')
  })

  it('assigns Produce to "fresh tomatoes"', () => {
    expect(assignSection('fresh tomatoes')).toBe('Produce')
  })

  it('does not misclassify "pecan" as Canned & Jarred', () => {
    expect(assignSection('pecan')).toBe('Other')
  })
})

// ── isPantryStaple ─────────────────────────────────────────────────────────────

describe('isPantryStaple', () => {
  it('marks olive oil as pantry staple', () => {
    expect(isPantryStaple('olive oil')).toBe(true)
  })

  it('marks salt as pantry staple', () => {
    expect(isPantryStaple('salt')).toBe(true)
  })

  it('marks garlic as pantry staple', () => {
    expect(isPantryStaple('garlic')).toBe(true)
  })

  it('does not mark chicken as pantry staple', () => {
    expect(isPantryStaple('chicken breast')).toBe(false)
  })

  it('does not mark zucchini as pantry staple', () => {
    expect(isPantryStaple('zucchini')).toBe(false)
  })
})

// ── T08: Combine same-unit ingredients ────────────────────────────────────────

describe('T08 - combineIngredients sums same-unit duplicates', () => {
  it('sums 200g + 100g pasta = 300g', () => {
    const inputs = [
      { parsed: parseIngredientLine('200g pasta'), recipeTitle: 'A', scaleFactor: 1 },
      { parsed: parseIngredientLine('100g pasta'), recipeTitle: 'B', scaleFactor: 1 },
    ]
    const { resolved } = combineIngredients(inputs)
    const pasta = resolved.find((i) => i.name.includes('pasta'))!
    expect(pasta.amount).toBe(300)
    expect(pasta.unit).toBe('g')
    expect(pasta.recipes).toContain('A')
    expect(pasta.recipes).toContain('B')
  })

  it('marks differing-unit items as ambiguous', () => {
    const inputs = [
      { parsed: parseIngredientLine('2 cups flour'), recipeTitle: 'A', scaleFactor: 1 },
      { parsed: parseIngredientLine('200g flour'), recipeTitle: 'B', scaleFactor: 1 },
    ]
    const { ambiguous } = combineIngredients(inputs)
    expect(ambiguous.length).toBeGreaterThan(0)
  })
})

// ── regression #274: ingredient deduplication ────────────────────────────────

describe('regression #274 - ingredient deduplication', () => {
  it('normalizeIngredientName strips leading "fresh" so "fresh cilantro" deduplicates with "cilantro"', () => {
    expect(normalizeIngredientName('fresh cilantro')).toBe('cilantro')
    expect(normalizeIngredientName('cilantro')).toBe('cilantro')
  })

  it('normalizeIngredientName removes commas so "boneless, skinless" matches "boneless skinless"', () => {
    expect(normalizeIngredientName('boneless, skinless chicken breast'))
      .toBe(normalizeIngredientName('boneless skinless chicken breast'))
  })

  it('parseIngredientLine strips post-comma prep instruction from rawName', () => {
    const result = parseIngredientLine('1 lb boneless skinless chicken breast, cut into pieces')
    expect(result.rawName).toBe('boneless skinless chicken breast')
    expect(result.rawName).not.toContain('cut')
  })

  it('parseIngredientLine strips multiple trailing prep segments', () => {
    const result = parseIngredientLine('2 cloves garlic, peeled, minced')
    expect(result.rawName).toBe('garlic')
  })

  it('combines "1 bunch fresh cilantro" and "1 bunch cilantro" into one item', () => {
    const inputs = [
      { parsed: parseIngredientLine('1 bunch fresh cilantro'), recipeTitle: 'A', scaleFactor: 1 },
      { parsed: parseIngredientLine('1 bunch cilantro'), recipeTitle: 'B', scaleFactor: 1 },
    ]
    const { resolved, ambiguous } = combineIngredients(inputs)
    expect(ambiguous).toHaveLength(0)
    const cilantro = resolved.find((i) => i.name.toLowerCase().includes('cilantro'))!
    expect(cilantro).toBeDefined()
    expect(cilantro.recipes).toContain('A')
    expect(cilantro.recipes).toContain('B')
    // Display name should be the simpler form (no "fresh" prefix)
    expect(cilantro.name).toBe('cilantro')
  })

  it('combines chicken breast with prep detail and without into one item', () => {
    const inputs = [
      { parsed: parseIngredientLine('2 lb boneless, skinless chicken breast, cut into pieces'), recipeTitle: 'A', scaleFactor: 1 },
      { parsed: parseIngredientLine('1 lb boneless skinless chicken breast'), recipeTitle: 'B', scaleFactor: 1 },
    ]
    const { resolved, ambiguous } = combineIngredients(inputs)
    expect(ambiguous).toHaveLength(0)
    const chicken = resolved.find((i) => i.name.toLowerCase().includes('chicken'))!
    expect(chicken).toBeDefined()
    expect(chicken.recipes).toContain('A')
    expect(chicken.recipes).toContain('B')
    expect(chicken.amount).toBe(3)
    // Display name should not include the prep instruction
    expect(chicken.name).not.toContain('cut')
    expect(chicken.name).not.toContain('pieces')
  })
})

// ── T10: Scaling ──────────────────────────────────────────────────────────────

describe('T10 - Scale factor doubles amounts at 4 people (base 2)', () => {
  it('doubles amounts when scaleFactor=2', () => {
    const inputs = [
      { parsed: parseIngredientLine('200g pasta'), recipeTitle: 'Pasta', scaleFactor: 2 },
    ]
    const { resolved } = combineIngredients(inputs)
    expect(resolved[0]!.amount).toBe(400)
  })
})

// ── scaleItem ─────────────────────────────────────────────────────────────────

describe('scaleItem', () => {
  const baseItem: GroceryItem = {
    id: 'x', name: 'pasta', amount: 200, unit: 'g',
    section: 'Pantry', is_pantry: false, checked: false, recipes: ['A'],
  }

  it('scales amount by factor', () => {
    expect(scaleItem(baseItem, 2).amount).toBe(400)
  })

  it('does not scale checked items', () => {
    expect(scaleItem({ ...baseItem, checked: true }, 2).amount).toBe(200)
  })

  it('does not scale null amounts', () => {
    expect(scaleItem({ ...baseItem, amount: null }, 2).amount).toBeNull()
  })
})

// ── T11 & T12: Per-recipe override / plan-level change ──────────────────────

describe('T11 & T12 - effectiveServings', () => {
  const scales: RecipeScale[] = [
    { recipe_id: 'r1', recipe_title: 'Pasta', servings: null },    // inherits plan
    { recipe_id: 'r2', recipe_title: 'Salad', servings: 4 },       // override
  ]

  it('T11: returns override when set', () => {
    expect(effectiveServings('r2', scales, 2)).toBe(4)
  })

  it('T12: returns plan default when no override', () => {
    expect(effectiveServings('r1', scales, 2)).toBe(2)
  })

  it('T12: changing plan default does not affect overridden recipe', () => {
    // effectiveServings always returns the override for r2 regardless of planServings
    expect(effectiveServings('r2', scales, 6)).toBe(4)
  })
})

// ── T13: Reset override ───────────────────────────────────────────────────────

describe('T13 - Reset to default removes override', () => {
  it('returns plan default after override set to null', () => {
    const scales: RecipeScale[] = [
      { recipe_id: 'r1', recipe_title: 'Pasta', servings: null },
    ]
    // After reset, servings is null → falls back to plan default
    expect(effectiveServings('r1', scales, 3)).toBe(3)
  })
})

// ── buildPlainTextList ────────────────────────────────────────────────────────

describe('buildPlainTextList', () => {
  const items: GroceryItem[] = [
    { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', is_pantry: false, checked: false, recipes: ['Pasta'] },
    { id: 'i2', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', is_pantry: true, checked: false, recipes: ['Pasta'] },
  ]
  const scales: RecipeScale[] = [
    { recipe_id: 'r1', recipe_title: 'Pasta', servings: 4 },
  ]

  it('outputs one line per item with no headers or bullets', () => {
    const text = buildPlainTextList(items, scales, 2, '2026-03-15')
    const lines = text.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('200 g pasta')
    expect(lines[1]).toBe('2 tbsp olive oil')
  })

  it('includes all items (including pantry) with no section labels', () => {
    const text = buildPlainTextList(items, scales, 2, '2026-03-15')
    expect(text).toContain('olive oil')
    expect(text).not.toContain('PANTRY')
    expect(text).not.toContain('Pasta (')
  })

  it('omits amount prefix when amount is null', () => {
    const noAmountItems: GroceryItem[] = [
      { id: 'i3', name: 'salt', amount: null, unit: null, section: 'Pantry', is_pantry: true, checked: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(noAmountItems, [], 2, '2026-03-15')
    expect(text).toBe('salt')
  })

  it('has no bullets, dashes, or emoji headers', () => {
    const text = buildPlainTextList(items, scales, 2, '2026-03-15')
    expect(text).not.toMatch(/^[•\-–🛒]/m)
  })

  it('onlyUnchecked: true excludes bought items', () => {
    const mixedItems: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', is_pantry: false, checked: false, bought: false, recipes: ['Pasta'] },
      { id: 'i2', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', is_pantry: true, checked: false, bought: true, recipes: ['Pasta'] },
    ]
    const text = buildPlainTextList(mixedItems, scales, 2, '2026-03-15', { onlyUnchecked: true })
    expect(text).toContain('pasta')
    expect(text).not.toContain('olive oil')
  })

  it('onlyUnchecked: false includes all items regardless of bought', () => {
    const mixedItems: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', is_pantry: false, checked: false, bought: false, recipes: ['Pasta'] },
      { id: 'i2', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', is_pantry: true, checked: false, bought: true, recipes: ['Pasta'] },
    ]
    const text = buildPlainTextList(mixedItems, scales, 2, '2026-03-15', { onlyUnchecked: false })
    expect(text).toContain('pasta')
    expect(text).toContain('olive oil')
  })

  it('without options includes all items (backwards-compatible)', () => {
    const mixedItems: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', is_pantry: false, checked: false, bought: false, recipes: ['Pasta'] },
      { id: 'i2', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', is_pantry: true, checked: false, bought: true, recipes: ['Pasta'] },
    ]
    const text = buildPlainTextList(mixedItems, scales, 2, '2026-03-15')
    expect(text).toContain('pasta')
    expect(text).toContain('olive oil')
  })
})


// ── T12: Pantry export semantics ──────────────────────────────────────────────────

describe('T12 - Pantry item export semantics', () => {
  const pantryScales: RecipeScale[] = [{ recipe_id: 'r1', recipe_title: 'Soup', servings: 4 }]

  it('pantry item with checked=true is included in onlyUnchecked export', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', is_pantry: true, checked: true, bought: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, pantryScales, 2, '2026-03-15', { onlyUnchecked: true })
    expect(text).toContain('olive oil')
  })

  it('pantry item with checked=false is excluded from onlyUnchecked export', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', is_pantry: true, checked: false, bought: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, pantryScales, 2, '2026-03-15', { onlyUnchecked: true })
    expect(text).not.toContain('olive oil')
  })

  it('non-pantry item with bought=true is excluded from onlyUnchecked export', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', is_pantry: false, checked: false, bought: true, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, pantryScales, 2, '2026-03-15', { onlyUnchecked: true })
    expect(text).not.toContain('pasta')
  })

  it('non-pantry item with bought=false is included in onlyUnchecked export', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', is_pantry: false, checked: false, bought: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, pantryScales, 2, '2026-03-15', { onlyUnchecked: true })
    expect(text).toContain('pasta')
  })

  it('non-pantry item with checked=true is excluded from onlyUnchecked export (#276)', () => {
    // checked=true on a non-pantry item means "I already have this" — should not be exported
    const items: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', is_pantry: false, checked: true, bought: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, pantryScales, 2, '2026-03-15', { onlyUnchecked: true })
    expect(text).not.toContain('pasta')
  })
})

// ── T13: Combined pantry + non-pantry export (#287) ───────────────────────────

describe('T13 - Combined export: unchecked Need-to-Buy + checked Pantry (#287)', () => {
  const scales: RecipeScale[] = [{ recipe_id: 'r1', recipe_title: 'Soup', servings: 4 }]

  it('exports unchecked Need-to-Buy and checked Pantry items; excludes all others', () => {
    const items: GroceryItem[] = [
      // Need to Buy — unchecked: should be included
      { id: 'i1', name: 'chicken', amount: 1, unit: 'lb', section: 'Proteins', is_pantry: false, checked: false, bought: false, recipes: ['Soup'] },
      // Need to Buy — checked ("I already have this"): should be excluded
      { id: 'i2', name: 'carrots', amount: 3, unit: null, section: 'Produce', is_pantry: false, checked: true, bought: false, recipes: ['Soup'] },
      // Need to Buy — bought ("Got It"): should be excluded
      { id: 'i3', name: 'celery', amount: 2, unit: null, section: 'Produce', is_pantry: false, checked: false, bought: true, recipes: ['Soup'] },
      // Pantry — checked ("need to buy"): should be included
      { id: 'i4', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', is_pantry: true, checked: true, bought: false, recipes: ['Soup'] },
      // Pantry — unchecked ("have it in pantry"): should be excluded
      { id: 'i5', name: 'salt', amount: null, unit: null, section: 'Pantry', is_pantry: true, checked: false, bought: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, scales, 4, '2026-03-30', { onlyUnchecked: true })
    const lines = text.split('\n')
    expect(lines).toHaveLength(2)
    expect(text).toContain('chicken')   // unchecked Need to Buy ✓
    expect(text).toContain('olive oil') // checked Pantry ✓
    expect(text).not.toContain('carrots')  // checked Need to Buy ✗
    expect(text).not.toContain('celery')   // bought ✗
    expect(text).not.toContain('salt')     // unchecked Pantry ✗
  })

  it('export lines are one item per line with no headers or bullets', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'chicken', amount: 1, unit: 'lb', section: 'Proteins', is_pantry: false, checked: false, bought: false, recipes: ['Soup'] },
      { id: 'i4', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', is_pantry: true, checked: true, bought: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, scales, 4, '2026-03-30', { onlyUnchecked: true })
    const lines = text.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('1 lb chicken')
    expect(lines[1]).toBe('2 tbsp olive oil')
    expect(text).not.toMatch(/^[•\-–🛒]/m)
  })
})

// ── getCurrentWeekSunday ──────────────────────────────────────────────────────

describe('getCurrentWeekSunday', () => {
  it('returns a Sunday (day 0)', () => {
    const sunday = getCurrentWeekSunday()
    const d = new Date(`${sunday}T00:00:00Z`)
    expect(d.getUTCDay()).toBe(0)
  })

  it('returns YYYY-MM-DD format', () => {
    expect(getCurrentWeekSunday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ── formatWeekLabel ───────────────────────────────────────────────────────────

describe('formatWeekLabel', () => {
  it('returns a human-readable range', () => {
    const label = formatWeekLabel('2026-03-15')
    expect(label).toMatch(/Mar/)
  })
})
