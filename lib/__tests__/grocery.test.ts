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
  isWaterIngredient,
  combineIngredients,
  deduplicateItems,
  scaleItem,
  effectiveServings,
  buildPlainTextList,
  buildICSExport,
  buildShortcutsURL,
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

  it('does not mark fresh garlic as pantry staple (fresh produce)', () => {
    expect(isPantryStaple('garlic')).toBe(false)
  })

  it('does not mark onion as pantry staple (fresh produce)', () => {
    expect(isPantryStaple('onion')).toBe(false)
  })

  it('does not mark bell pepper as pantry staple (fresh produce)', () => {
    expect(isPantryStaple('bell pepper')).toBe(false)
  })

  it('marks garlic powder as pantry staple', () => {
    expect(isPantryStaple('garlic powder')).toBe(true)
  })

  it('marks onion powder as pantry staple', () => {
    expect(isPantryStaple('onion powder')).toBe(true)
  })

  it('marks red pepper flakes as pantry staple', () => {
    expect(isPantryStaple('red pepper flakes')).toBe(true)
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

// ── regression #358: full unit name parsing ───────────────────────────────────

describe('regression #358 - full-form unit names are recognized', () => {
  it('parses "2 tablespoons olive oil" with unit=tbsp', () => {
    const r = parseIngredientLine('2 tablespoons olive oil')
    expect(r.amount).toBe(2)
    expect(r.unit).toBe('tbsp')
    expect(r.name).toContain('olive oil')
  })

  it('parses "1 teaspoon salt" with unit=tsp', () => {
    const r = parseIngredientLine('1 teaspoon salt')
    expect(r.amount).toBe(1)
    expect(r.unit).toBe('tsp')
    expect(r.name).toContain('salt')
  })

  it('parses "8 ounces cream cheese" with unit=oz', () => {
    const r = parseIngredientLine('8 ounces cream cheese')
    expect(r.amount).toBe(8)
    expect(r.unit).toBe('oz')
    expect(r.name).toContain('cream cheese')
  })

  it('parses "1 pound chicken breast" with unit=lb', () => {
    const r = parseIngredientLine('1 pound chicken breast')
    expect(r.amount).toBe(1)
    expect(r.unit).toBe('lb')
    expect(r.name).toContain('chicken breast')
  })

  it('combines "2 tablespoons cilantro" and "1 tbsp cilantro" (same canonical unit)', () => {
    const inputs = [
      { parsed: parseIngredientLine('2 tablespoons fresh cilantro'), recipeTitle: 'A', scaleFactor: 1 },
      { parsed: parseIngredientLine('1 tbsp cilantro'), recipeTitle: 'B', scaleFactor: 1 },
    ]
    const { resolved, ambiguous } = combineIngredients(inputs)
    expect(ambiguous).toHaveLength(0)
    const cilantro = resolved.find((i) => i.name.toLowerCase().includes('cilantro'))!
    expect(cilantro).toBeDefined()
    expect(cilantro.amount).toBe(3)
    expect(cilantro.unit).toBe('tbsp')
    expect(cilantro.recipes).toContain('A')
    expect(cilantro.recipes).toContain('B')
  })

  it('combines "1/4 cup parmesan" and "1 cup parmesan" into one item with summed amount', () => {
    const inputs = [
      { parsed: parseIngredientLine('1/4 cup parmesan'), recipeTitle: 'A', scaleFactor: 1 },
      { parsed: parseIngredientLine('1 cup parmesan'), recipeTitle: 'B', scaleFactor: 1 },
    ]
    const { resolved, ambiguous } = combineIngredients(inputs)
    expect(ambiguous).toHaveLength(0)
    const parmesan = resolved.find((i) => i.name.toLowerCase().includes('parmesan'))!
    expect(parmesan).toBeDefined()
    expect(parmesan.amount).toBeCloseTo(1.25)
    expect(parmesan.unit).toBe('cup')
  })

  it('combines "1 lb chicken breast" and "chicken breast" (no amount) into one item', () => {
    const inputs = [
      { parsed: parseIngredientLine('1 lb chicken breast'), recipeTitle: 'A', scaleFactor: 1 },
      { parsed: parseIngredientLine('chicken breast'), recipeTitle: 'B', scaleFactor: 1 },
    ]
    const { resolved, ambiguous } = combineIngredients(inputs)
    expect(ambiguous).toHaveLength(0)
    const chicken = resolved.find((i) => i.name.toLowerCase().includes('chicken'))!
    expect(chicken).toBeDefined()
    expect(chicken.amount).toBe(1)
    expect(chicken.unit).toBe('lb')
    expect(chicken.recipes).toContain('A')
    expect(chicken.recipes).toContain('B')
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
    section: 'Pantry', isPantry: false, checked: false, recipes: ['A'],
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
    { recipeId: 'r1', recipeTitle: 'Pasta', servings: null },    // inherits plan
    { recipeId: 'r2', recipeTitle: 'Salad', servings: 4 },       // override
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
      { recipeId: 'r1', recipeTitle: 'Pasta', servings: null },
    ]
    // After reset, servings is null → falls back to plan default
    expect(effectiveServings('r1', scales, 3)).toBe(3)
  })
})

// ── buildPlainTextList ────────────────────────────────────────────────────────

describe('buildPlainTextList', () => {
  const items: GroceryItem[] = [
    { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', isPantry: false, checked: false, recipes: ['Pasta'] },
    { id: 'i2', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: false, recipes: ['Pasta'] },
  ]
  it('outputs one line per item with no headers or bullets', () => {
    const text = buildPlainTextList(items)
    const lines = text.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('200 g pasta')
    expect(lines[1]).toBe('2 tbsp olive oil')
  })

  it('includes all items (including pantry) with no section labels', () => {
    const text = buildPlainTextList(items)
    expect(text).toContain('olive oil')
    expect(text).not.toContain('PANTRY')
    expect(text).not.toContain('Pasta (')
  })

  it('omits amount prefix when amount is null', () => {
    const noAmountItems: GroceryItem[] = [
      { id: 'i3', name: 'salt', amount: null, unit: null, section: 'Pantry', isPantry: true, checked: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(noAmountItems)
    expect(text).toBe('salt')
  })

  it('has no bullets, dashes, or emoji headers', () => {
    const text = buildPlainTextList(items)
    expect(text).not.toMatch(/^[•\-–🛒]/m)
  })

  it('onlyUnchecked: true excludes bought items', () => {
    const mixedItems: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', isPantry: false, checked: false, bought: false, recipes: ['Pasta'] },
      { id: 'i2', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: false, bought: true, recipes: ['Pasta'] },
    ]
    const text = buildPlainTextList(mixedItems, { onlyUnchecked: true })
    expect(text).toContain('pasta')
    expect(text).not.toContain('olive oil')
  })

  it('onlyUnchecked: false includes all items regardless of bought', () => {
    const mixedItems: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', isPantry: false, checked: false, bought: false, recipes: ['Pasta'] },
      { id: 'i2', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: false, bought: true, recipes: ['Pasta'] },
    ]
    const text = buildPlainTextList(mixedItems, { onlyUnchecked: false })
    expect(text).toContain('pasta')
    expect(text).toContain('olive oil')
  })

  it('without options includes all items (backwards-compatible)', () => {
    const mixedItems: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', isPantry: false, checked: false, bought: false, recipes: ['Pasta'] },
      { id: 'i2', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: false, bought: true, recipes: ['Pasta'] },
    ]
    const text = buildPlainTextList(mixedItems)
    expect(text).toContain('pasta')
    expect(text).toContain('olive oil')
  })
})


// ── T12: Pantry export semantics ──────────────────────────────────────────────────

describe('T12 - Pantry item export semantics', () => {

  it('pantry item with checked=true is included in onlyUnchecked export', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: true, bought: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, { onlyUnchecked: true })
    expect(text).toContain('olive oil')
  })

  it('pantry item with checked=false is excluded from onlyUnchecked export', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: false, bought: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, { onlyUnchecked: true })
    expect(text).not.toContain('olive oil')
  })

  it('non-pantry item with bought=true is excluded from onlyUnchecked export', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', isPantry: false, checked: false, bought: true, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, { onlyUnchecked: true })
    expect(text).not.toContain('pasta')
  })

  it('non-pantry item with bought=false is included in onlyUnchecked export', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', isPantry: false, checked: false, bought: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, { onlyUnchecked: true })
    expect(text).toContain('pasta')
  })

  it('non-pantry item with checked=true is excluded from onlyUnchecked export (#276)', () => {
    // checked=true on a non-pantry item means "I already have this" — should not be exported
    const items: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', isPantry: false, checked: true, bought: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, { onlyUnchecked: true })
    expect(text).not.toContain('pasta')
  })
})

// ── T13: Combined pantry + non-pantry export (#287) ───────────────────────────

describe('T13 - Combined export: unchecked Need-to-Buy + checked Pantry (#287)', () => {
  it('exports unchecked Need-to-Buy and checked Pantry items; excludes all others', () => {
    const items: GroceryItem[] = [
      // Need to Buy — unchecked: should be included
      { id: 'i1', name: 'chicken', amount: 1, unit: 'lb', section: 'Proteins', isPantry: false, checked: false, bought: false, recipes: ['Soup'] },
      // Need to Buy — checked ("I already have this"): should be excluded
      { id: 'i2', name: 'carrots', amount: 3, unit: null, section: 'Produce', isPantry: false, checked: true, bought: false, recipes: ['Soup'] },
      // Need to Buy — bought ("Got It"): should be excluded
      { id: 'i3', name: 'celery', amount: 2, unit: null, section: 'Produce', isPantry: false, checked: false, bought: true, recipes: ['Soup'] },
      // Pantry — checked ("need to buy"): should be included
      { id: 'i4', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: true, bought: false, recipes: ['Soup'] },
      // Pantry — unchecked ("have it in pantry"): should be excluded
      { id: 'i5', name: 'salt', amount: null, unit: null, section: 'Pantry', isPantry: true, checked: false, bought: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, { onlyUnchecked: true })
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
      { id: 'i1', name: 'chicken', amount: 1, unit: 'lb', section: 'Proteins', isPantry: false, checked: false, bought: false, recipes: ['Soup'] },
      { id: 'i4', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: true, bought: false, recipes: ['Soup'] },
    ]
    const text = buildPlainTextList(items, { onlyUnchecked: true })
    const lines = text.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('1 lb chicken')
    expect(lines[1]).toBe('2 tbsp olive oil')
    expect(text).not.toMatch(/^[•\-–🛒]/m)
  })
})

// ── buildICSExport ───────────────────────────────────────────────────────────

describe('buildICSExport', () => {
  it('produces a valid VCALENDAR wrapper for an empty list', () => {
    const ics = buildICSExport([])
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('PRODID:-//Thymeline//Grocery List//EN')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).not.toContain('VTODO')
  })

  it('creates one VTODO per item with correct SUMMARY', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', isPantry: false, checked: false, recipes: ['Pasta'] },
      { id: 'i2', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: false, recipes: ['Pasta'] },
    ]
    const ics = buildICSExport(items)
    const vtodoCount = (ics.match(/BEGIN:VTODO/g) || []).length
    expect(vtodoCount).toBe(2)
    expect(ics).toContain('SUMMARY:200 g pasta')
    expect(ics).toContain('SUMMARY:2 tbsp olive oil')
  })

  it('uses CRLF line endings per RFC 5545', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 1, unit: 'lb', section: 'Pantry', isPantry: false, checked: false, recipes: ['Soup'] },
    ]
    const ics = buildICSExport(items)
    const lines = ics.split('\r\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('respects onlyUnchecked with pantry semantics', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'chicken', amount: 1, unit: 'lb', section: 'Proteins', isPantry: false, checked: false, bought: false, recipes: ['Soup'] },
      { id: 'i2', name: 'carrots', amount: 3, unit: null, section: 'Produce', isPantry: false, checked: true, bought: false, recipes: ['Soup'] },
      { id: 'i3', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: true, bought: false, recipes: ['Soup'] },
      { id: 'i4', name: 'salt', amount: null, unit: null, section: 'Pantry', isPantry: true, checked: false, bought: false, recipes: ['Soup'] },
    ]
    const ics = buildICSExport(items, { onlyUnchecked: true })
    const vtodoCount = (ics.match(/BEGIN:VTODO/g) || []).length
    expect(vtodoCount).toBe(2)
    expect(ics).toContain('SUMMARY:1 lb chicken')
    expect(ics).toContain('SUMMARY:2 tbsp olive oil')
    expect(ics).not.toContain('carrots')
    expect(ics).not.toContain('salt')
  })

  it('escapes special characters in SUMMARY per RFC 5545', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'flour, all-purpose; sifted\\fine', amount: 2, unit: 'cups', section: 'Pantry', isPantry: false, checked: false, recipes: ['Bread'] },
    ]
    const ics = buildICSExport(items)
    expect(ics).toContain('SUMMARY:2 cups flour\\, all-purpose\\; sifted\\\\fine')
  })

  it('strips newlines from item names in SUMMARY', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'chicken\nbreast', amount: 1, unit: 'lb', section: 'Proteins', isPantry: false, checked: false, recipes: ['Dinner'] },
    ]
    const ics = buildICSExport(items)
    expect(ics).toContain('SUMMARY:1 lb chicken breast')
    const vtodoSection = ics.split('BEGIN:VTODO')[1]!.split('END:VTODO')[0]!
    expect(vtodoSection.replace(/\r\n/g, '')).not.toContain('\n')
  })
})

// ── buildShortcutsURL ────────────────────────────────────────────────────────

describe('buildShortcutsURL', () => {
  it('builds a valid shortcuts:// URL with encoded items', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', isPantry: false, checked: false, recipes: ['Pasta'] },
      { id: 'i2', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: false, recipes: ['Pasta'] },
    ]
    const url = buildShortcutsURL(items)
    expect(url).toContain('shortcuts://run-shortcut')
    expect(url).toContain('name=Thymeline%20Groceries')
    expect(url).toContain('input=text')
    const textParam = new URL(url).searchParams.get('text')!
    const lines = textParam.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('200 g pasta')
    expect(lines[1]).toBe('2 tbsp olive oil')
  })

  it('returns URL with empty text for empty list', () => {
    const url = buildShortcutsURL([])
    expect(url).toContain('shortcuts://run-shortcut')
    expect(url).toContain('text=')
  })

  it('respects onlyUnchecked filter', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', isPantry: false, checked: false, bought: false, recipes: ['Pasta'] },
      { id: 'i2', name: 'rice', amount: 1, unit: 'cup', section: 'Pantry', isPantry: false, checked: true, bought: false, recipes: ['Bowl'] },
    ]
    const url = buildShortcutsURL(items, { onlyUnchecked: true })
    const textParam = new URL(url).searchParams.get('text')!
    expect(textParam).toContain('pasta')
    expect(textParam).not.toContain('rice')
  })

  it('encodes special characters in item names', () => {
    const items: GroceryItem[] = [
      { id: 'i1', name: 'flour, all-purpose & sifted', amount: 2, unit: 'cups', section: 'Pantry', isPantry: false, checked: false, recipes: ['Bread'] },
    ]
    const url = buildShortcutsURL(items)
    const textParam = new URL(url).searchParams.get('text')!
    expect(textParam).toBe('2 cups flour, all-purpose & sifted')
  })
})

// ── deduplicateItems — final safety-net dedup (regression #358b) ─────────────

describe('deduplicateItems (regression #358b)', () => {
  const base: Omit<GroceryItem, 'id' | 'name' | 'amount' | 'unit' | 'recipes'> = {
    section: 'Pantry', isPantry: false, checked: false,
  }

  it('passes through a list with no duplicates unchanged', () => {
    const items: GroceryItem[] = [
      { id: 'a', name: 'parmesan', amount: 0.25, unit: 'cup', recipes: ['A'], ...base },
      { id: 'b', name: 'olive oil', amount: 2, unit: 'tbsp', recipes: ['B'], ...base },
    ]
    const result = deduplicateItems(items)
    expect(result).toHaveLength(2)
  })

  it('merges two same-name same-unit items (summing amounts)', () => {
    const items: GroceryItem[] = [
      { id: 'a', name: 'parmesan', amount: 0.25, unit: 'cup', recipes: ['A'], ...base },
      { id: 'b', name: 'parmesan', amount: 1,    unit: 'cup', recipes: ['B'], ...base },
    ]
    const result = deduplicateItems(items)
    expect(result).toHaveLength(1)
    expect(result[0]!.amount).toBeCloseTo(1.25)
    expect(result[0]!.unit).toBe('cup')
    expect(result[0]!.recipes).toContain('A')
    expect(result[0]!.recipes).toContain('B')
  })

  it('merges "grated parmesan" and "parmesan" by normalized name', () => {
    const items: GroceryItem[] = [
      { id: 'a', name: 'grated parmesan', amount: 0.25, unit: 'cup', recipes: ['A'], ...base },
      { id: 'b', name: 'parmesan',        amount: 1,    unit: 'cup', recipes: ['B'], ...base },
    ]
    const result = deduplicateItems(items)
    expect(result).toHaveLength(1)
    expect(result[0]!.amount).toBeCloseTo(1.25)
    expect(result[0]!.recipes).toContain('A')
    expect(result[0]!.recipes).toContain('B')
  })

  it('merges items where one has null unit, keeping the non-null unit', () => {
    const items: GroceryItem[] = [
      { id: 'a', name: 'cilantro', amount: 1,    unit: 'bunch', recipes: ['A'], ...base },
      { id: 'b', name: 'cilantro', amount: null,  unit: null,   recipes: ['B'], ...base },
    ]
    const result = deduplicateItems(items)
    expect(result).toHaveLength(1)
    expect(result[0]!.amount).toBe(1)
    expect(result[0]!.unit).toBe('bunch')
    expect(result[0]!.recipes).toContain('A')
    expect(result[0]!.recipes).toContain('B')
  })

  it('merges items with different units by keeping the larger amount', () => {
    const items: GroceryItem[] = [
      { id: 'a', name: 'chicken breast', amount: 2, unit: 'lb', recipes: ['A'], ...base },
      { id: 'b', name: 'chicken breast', amount: 1, unit: 'oz', recipes: ['B'], ...base },
    ]
    const result = deduplicateItems(items)
    expect(result).toHaveLength(1)
    expect(result[0]!.recipes).toContain('A')
    expect(result[0]!.recipes).toContain('B')
  })

  it('does not deduplicate genuinely different ingredients', () => {
    const items: GroceryItem[] = [
      { id: 'a', name: 'parmesan',    amount: 0.5, unit: 'cup',  recipes: ['A'], ...base },
      { id: 'b', name: 'mozzarella', amount: 1,   unit: 'cup',  recipes: ['B'], ...base },
      { id: 'c', name: 'cilantro',   amount: 1,   unit: 'bunch',recipes: ['C'], ...base },
    ]
    const result = deduplicateItems(items)
    expect(result).toHaveLength(3)
  })
})

// ── regression #327: grocery list organization ───────────────────────────────

describe('regression #327 - bratwurst and sausage variants → Proteins', () => {
  it('assigns Proteins to bratwurst', () => {
    expect(assignSection('bratwurst')).toBe('Proteins')
  })

  it('assigns Proteins to bratwurst links', () => {
    expect(assignSection('bratwurst links')).toBe('Proteins')
  })

  it('assigns Proteins to kielbasa', () => {
    expect(assignSection('kielbasa')).toBe('Proteins')
  })

  it('assigns Proteins to pepperoni', () => {
    expect(assignSection('pepperoni')).toBe('Proteins')
  })

  it('assigns Proteins to salami', () => {
    expect(assignSection('salami')).toBe('Proteins')
  })

  it('assigns Proteins to prosciutto', () => {
    expect(assignSection('prosciutto')).toBe('Proteins')
  })

  it('assigns Proteins to chorizo', () => {
    expect(assignSection('chorizo')).toBe('Proteins')
  })

  it('assigns Proteins to hot dog', () => {
    expect(assignSection('hot dog')).toBe('Proteins')
  })
})

describe('regression #327 - specific cheese names → Dairy & Eggs', () => {
  it('assigns Dairy & Eggs to cheddar', () => {
    expect(assignSection('cheddar')).toBe('Dairy & Eggs')
  })

  it('assigns Dairy & Eggs to cheddar cheese', () => {
    expect(assignSection('cheddar cheese')).toBe('Dairy & Eggs')
  })

  it('assigns Dairy & Eggs to feta', () => {
    expect(assignSection('feta')).toBe('Dairy & Eggs')
  })

  it('assigns Dairy & Eggs to gruyere', () => {
    expect(assignSection('gruyere')).toBe('Dairy & Eggs')
  })

  it('assigns Dairy & Eggs to gouda', () => {
    expect(assignSection('gouda')).toBe('Dairy & Eggs')
  })

  it('assigns Dairy & Eggs to brie', () => {
    expect(assignSection('brie')).toBe('Dairy & Eggs')
  })

  it('assigns Dairy & Eggs to provolone', () => {
    expect(assignSection('provolone')).toBe('Dairy & Eggs')
  })
})

describe('regression #327 - water exclusion', () => {
  it('isWaterIngredient returns true for "water"', () => {
    expect(isWaterIngredient('water')).toBe(true)
  })

  it('isWaterIngredient returns true for "hot water"', () => {
    expect(isWaterIngredient('hot water')).toBe(true)
  })

  it('isWaterIngredient returns true for "cold water"', () => {
    expect(isWaterIngredient('cold water')).toBe(true)
  })

  it('isWaterIngredient returns true for "warm water"', () => {
    expect(isWaterIngredient('warm water')).toBe(true)
  })

  it('isWaterIngredient returns true for "ice water"', () => {
    expect(isWaterIngredient('ice water')).toBe(true)
  })

  it('isWaterIngredient returns true for "sparkling water"', () => {
    expect(isWaterIngredient('sparkling water')).toBe(true)
  })

  it('isWaterIngredient returns false for "watermelon"', () => {
    expect(isWaterIngredient('watermelon')).toBe(false)
  })

  it('isWaterIngredient returns false for "water chestnut"', () => {
    expect(isWaterIngredient('water chestnut')).toBe(false)
  })

  it('isWaterIngredient returns false for "sparkling water with lemon"', () => {
    expect(isWaterIngredient('sparkling water with lemon')).toBe(false)
  })

  it('parseIngredientLine strips trailing "chilled" so "sparkling water, chilled" is excluded (regression #358b)', () => {
    const result = parseIngredientLine('1 cup sparkling water, chilled')
    // After stripping "chilled" the name should be "sparkling water" → excluded as water
    expect(isWaterIngredient(result.name)).toBe(true)
  })

  it('parseIngredientLine strips trailing "as needed" so water variants are excluded (regression #358b)', () => {
    const result = parseIngredientLine('hot water as needed')
    expect(isWaterIngredient(result.name)).toBe(true)
  })
})

describe('regression #327 - prep adjective stripping for combining', () => {
  it('normalizeIngredientName strips "grated" so "grated parmesan" → "parmesan"', () => {
    expect(normalizeIngredientName('grated parmesan')).toBe('parmesan')
  })

  it('normalizeIngredientName strips "shredded" so "shredded mozzarella" → "mozzarella"', () => {
    expect(normalizeIngredientName('shredded mozzarella')).toBe('mozzarella')
  })

  it('normalizeIngredientName strips "crumbled" so "crumbled feta" → "feta"', () => {
    expect(normalizeIngredientName('crumbled feta')).toBe('feta')
  })

  it('normalizeIngredientName strips "parmesan cheese" → "parmesan" via cheese strip', () => {
    expect(normalizeIngredientName('parmesan cheese')).toBe('parmesan')
  })

  it('normalizeIngredientName strips "cheddar cheese" → "cheddar"', () => {
    expect(normalizeIngredientName('cheddar cheese')).toBe('cheddar')
  })

  it('combines "grated parmesan" and "parmesan cheese" into one grocery item', () => {
    const inputs = [
      { parsed: parseIngredientLine('1/4 cup grated parmesan'), recipeTitle: 'Pasta', scaleFactor: 1 },
      { parsed: parseIngredientLine('1/2 cup parmesan cheese'), recipeTitle: 'Soup', scaleFactor: 1 },
    ]
    const { resolved, ambiguous } = combineIngredients(inputs)
    expect(ambiguous).toHaveLength(0)
    const parmesan = resolved.find((i) => i.name.toLowerCase().includes('parmesan'))!
    expect(parmesan).toBeDefined()
    expect(parmesan.recipes).toContain('Pasta')
    expect(parmesan.recipes).toContain('Soup')
    expect(parmesan.amount).toBeCloseTo(0.75)
  })

  it('does not incorrectly strip "cream cheese" to just "cream"', () => {
    expect(normalizeIngredientName('cream cheese')).toBe('cream cheese')
  })

  it('does not incorrectly strip "cottage cheese" to just "cottage"', () => {
    expect(normalizeIngredientName('cottage cheese')).toBe('cottage cheese')
  })
})

// ── regression #358c: comprehensive dedup and section fixes ──────────────────

describe('regression #358c - color/variety normalization for dedup', () => {
  it('normalizes "yellow onion" → "onion"', () => {
    expect(normalizeIngredientName('yellow onion')).toBe('onion')
  })

  it('normalizes "white onion" → "onion"', () => {
    expect(normalizeIngredientName('white onion')).toBe('onion')
  })

  it('normalizes "sweet onion" → "onion"', () => {
    expect(normalizeIngredientName('sweet onion')).toBe('onion')
  })

  it('normalizes "red bell pepper" → "bell pepper"', () => {
    expect(normalizeIngredientName('red bell pepper')).toBe('bell pepper')
  })

  it('normalizes "green bell pepper" → "bell pepper"', () => {
    expect(normalizeIngredientName('green bell pepper')).toBe('bell pepper')
  })

  it('normalizes "yellow bell peppers" → "bell pepper"', () => {
    expect(normalizeIngredientName('yellow bell peppers')).toBe('bell pepper')
  })

  it('does NOT normalize "flour tortilla" → "tortilla" (flour and corn are distinct products)', () => {
    expect(normalizeIngredientName('flour tortilla')).toBe('flour tortilla')
  })

  it('does NOT normalize "corn tortilla" → "tortilla"', () => {
    expect(normalizeIngredientName('corn tortilla')).toBe('corn tortilla')
  })

  it('normalizes "boneless skinless chicken breast" → "chicken breast"', () => {
    expect(normalizeIngredientName('boneless skinless chicken breast')).toBe('chicken breast')
  })

  it('normalizes "boneless, skinless chicken breast" → "chicken breast"', () => {
    expect(normalizeIngredientName('boneless, skinless chicken breast')).toBe('chicken breast')
  })

  it('normalizes "extra virgin olive oil" → "olive oil"', () => {
    expect(normalizeIngredientName('extra virgin olive oil')).toBe('olive oil')
  })

  it('normalizes "diced onion" → "onion" (leading prep word without comma)', () => {
    expect(normalizeIngredientName('diced onion')).toBe('onion')
  })

  it('normalizes "minced garlic" → "garlic"', () => {
    expect(normalizeIngredientName('minced garlic')).toBe('garlic')
  })

  it('normalizes "chopped cilantro" → "cilantro"', () => {
    expect(normalizeIngredientName('chopped cilantro')).toBe('cilantro')
  })

  it('normalizes "sliced mushrooms" → "mushroom"', () => {
    expect(normalizeIngredientName('sliced mushrooms')).toBe('mushroom')
  })

  it('normalizes "peeled shrimp" → "shrimp"', () => {
    expect(normalizeIngredientName('peeled shrimp')).toBe('shrimp')
  })

  it('combines "diced onion" and "onion" into one item', () => {
    const inputs = [
      { parsed: parseIngredientLine('1 diced onion'), recipeTitle: 'Soup', scaleFactor: 1 },
      { parsed: parseIngredientLine('2 onions'), recipeTitle: 'Stew', scaleFactor: 1 },
    ]
    const { resolved, ambiguous } = combineIngredients(inputs)
    expect(ambiguous).toHaveLength(0)
    const onion = resolved.find((i) => i.name.toLowerCase().includes('onion'))!
    expect(onion).toBeDefined()
    expect(onion.recipes).toContain('Soup')
    expect(onion.recipes).toContain('Stew')
  })

  it('combines "minced garlic" and "garlic" into one item', () => {
    const inputs = [
      { parsed: parseIngredientLine('3 cloves minced garlic'), recipeTitle: 'Pasta', scaleFactor: 1 },
      { parsed: parseIngredientLine('2 cloves garlic'), recipeTitle: 'Soup', scaleFactor: 1 },
    ]
    const { resolved, ambiguous } = combineIngredients(inputs)
    expect(ambiguous).toHaveLength(0)
    const garlic = resolved.find((i) => i.name.toLowerCase().includes('garlic'))!
    expect(garlic).toBeDefined()
    expect(garlic.amount).toBe(5)
    expect(garlic.recipes).toContain('Pasta')
    expect(garlic.recipes).toContain('Soup')
  })

  it('does NOT combine "diced tomatoes" with "cherry tomatoes" (different products)', () => {
    const inputs = [
      { parsed: parseIngredientLine('1 cup diced tomatoes'), recipeTitle: 'Sauce', scaleFactor: 1 },
      { parsed: parseIngredientLine('1 cup cherry tomatoes'), recipeTitle: 'Salad', scaleFactor: 1 },
    ]
    const { resolved } = combineIngredients(inputs)
    // "diced tomatoes" → "tomato", "cherry tomatoes" → "cherry tomato" — different names
    expect(resolved).toHaveLength(2)
  })

  it('does NOT strip "dried" so "dried cranberries" stays distinct from "cranberries"', () => {
    expect(normalizeIngredientName('dried cranberries')).toBe('dried cranberry')
    expect(normalizeIngredientName('dried cranberry')).not.toBe('cranberry')
  })

  it('does NOT strip "whole" so "whole milk" stays distinct from "milk" (regression #361)', () => {
    expect(normalizeIngredientName('whole milk')).toBe('whole milk')
  })

  it('does NOT strip "whole" so "whole wheat" stays intact (regression #361)', () => {
    expect(normalizeIngredientName('whole wheat flour')).toBe('whole wheat flour')
  })

  it('combines "yellow onion" and "white onion" into one item', () => {
    const inputs = [
      { parsed: parseIngredientLine('2 yellow onions'), recipeTitle: 'Taco', scaleFactor: 1 },
      { parsed: parseIngredientLine('1 white onion'), recipeTitle: 'Soup', scaleFactor: 1 },
    ]
    const { resolved, ambiguous } = combineIngredients(inputs)
    expect(ambiguous).toHaveLength(0)
    const onion = resolved.find((i) => i.name.toLowerCase().includes('onion'))!
    expect(onion).toBeDefined()
    expect(onion.recipes).toContain('Taco')
    expect(onion.recipes).toContain('Soup')
  })

  it('combines "red bell pepper" and "green bell pepper" into one item', () => {
    const inputs = [
      { parsed: parseIngredientLine('2 red bell peppers'), recipeTitle: 'Fajita', scaleFactor: 1 },
      { parsed: parseIngredientLine('1 green bell pepper'), recipeTitle: 'Stir Fry', scaleFactor: 1 },
    ]
    const { resolved, ambiguous } = combineIngredients(inputs)
    expect(ambiguous).toHaveLength(0)
    const pepper = resolved.find((i) => i.name.toLowerCase().includes('bell pepper'))!
    expect(pepper).toBeDefined()
    expect(pepper.recipes).toContain('Fajita')
    expect(pepper.recipes).toContain('Stir Fry')
  })

  it('does NOT combine "flour tortillas" and "corn tortillas" (different products)', () => {
    const inputs = [
      { parsed: parseIngredientLine('8 flour tortillas'), recipeTitle: 'Tacos', scaleFactor: 1 },
      { parsed: parseIngredientLine('4 corn tortillas'), recipeTitle: 'Enchilada', scaleFactor: 1 },
    ]
    const { resolved } = combineIngredients(inputs)
    // Should produce two separate items
    expect(resolved).toHaveLength(2)
  })

  it('combines "2 lb boneless skinless chicken breast" and "1 lb chicken breast"', () => {
    const inputs = [
      { parsed: parseIngredientLine('2 lb boneless skinless chicken breast'), recipeTitle: 'A', scaleFactor: 1 },
      { parsed: parseIngredientLine('1 lb chicken breast'), recipeTitle: 'B', scaleFactor: 1 },
    ]
    const { resolved, ambiguous } = combineIngredients(inputs)
    expect(ambiguous).toHaveLength(0)
    const chicken = resolved.find((i) => i.name.toLowerCase().includes('chicken'))!
    expect(chicken).toBeDefined()
    expect(chicken.amount).toBe(3)
    expect(chicken.unit).toBe('lb')
    expect(chicken.recipes).toContain('A')
    expect(chicken.recipes).toContain('B')
  })
})

describe('regression #358c - "divided" stripped from ingredient names', () => {
  it('parseIngredientLine strips "divided" from "olive oil, divided"', () => {
    const result = parseIngredientLine('2 tbsp olive oil, divided')
    expect(result.rawName).toBe('olive oil')
    expect(result.name).toBe('olive oil')
  })

  it('parseIngredientLine strips "divided" from "chicken broth, divided"', () => {
    const result = parseIngredientLine('1 cup chicken broth, divided')
    expect(result.rawName).toBe('chicken broth')
  })

  it('two "olive oil, divided" entries from different recipes merge into one', () => {
    const inputs = [
      { parsed: parseIngredientLine('2 tbsp olive oil, divided'), recipeTitle: 'A', scaleFactor: 1 },
      { parsed: parseIngredientLine('1 tbsp olive oil'), recipeTitle: 'B', scaleFactor: 1 },
    ]
    const { resolved, ambiguous } = combineIngredients(inputs)
    expect(ambiguous).toHaveLength(0)
    expect(resolved).toHaveLength(1)
    expect(resolved[0]!.amount).toBe(3)
  })
})

describe('regression #358c - section assignment for fresh produce', () => {
  it('assigns Produce to onion', () => {
    expect(assignSection('onion')).toBe('Produce')
  })

  it('assigns Produce to yellow onion', () => {
    expect(assignSection('yellow onion')).toBe('Produce')
  })

  it('assigns Produce to bell pepper', () => {
    expect(assignSection('bell pepper')).toBe('Produce')
  })

  it('assigns Produce to red bell pepper', () => {
    expect(assignSection('red bell pepper')).toBe('Produce')
  })

  it('assigns Produce to garlic', () => {
    expect(assignSection('garlic')).toBe('Produce')
  })

  it('assigns Pantry to garlic powder', () => {
    expect(assignSection('garlic powder')).toBe('Pantry')
  })

  it('assigns Pantry to onion powder', () => {
    expect(assignSection('onion powder')).toBe('Pantry')
  })

  it('assigns Bakery to tortilla', () => {
    expect(assignSection('tortilla')).toBe('Bakery')
  })

  it('assigns Bakery to flour tortilla', () => {
    expect(assignSection('flour tortilla')).toBe('Bakery')
  })

  it('assigns Bakery to corn tortilla', () => {
    expect(assignSection('corn tortilla')).toBe('Bakery')
  })
})

describe('regression #358c - isPantry conflict resolution in deduplicateItems', () => {
  it('item with isPantry:true and isPantry:false → merged result is isPantry:false', () => {
    const items: GroceryItem[] = [
      { id: 'a', name: 'tortilla', amount: 8, unit: null, section: 'Bakery', isPantry: false, checked: false, recipes: ['Tacos'] },
      { id: 'b', name: 'tortilla', amount: 4, unit: null, section: 'Bakery', isPantry: true,  checked: false, recipes: ['Enchilada'] },
    ]
    const result = deduplicateItems(items)
    expect(result).toHaveLength(1)
    expect(result[0]!.isPantry).toBe(false)
    expect(result[0]!.recipes).toContain('Tacos')
    expect(result[0]!.recipes).toContain('Enchilada')
  })

  it('two items both isPantry:true → merged result is isPantry:true', () => {
    const items: GroceryItem[] = [
      { id: 'a', name: 'olive oil', amount: 2, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: false, recipes: ['A'] },
      { id: 'b', name: 'olive oil', amount: 1, unit: 'tbsp', section: 'Pantry', isPantry: true, checked: false, recipes: ['B'] },
    ]
    const result = deduplicateItems(items)
    expect(result).toHaveLength(1)
    expect(result[0]!.isPantry).toBe(true)
    expect(result[0]!.amount).toBe(3)
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
