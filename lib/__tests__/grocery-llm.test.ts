/**
 * Tests for lib/grocery-llm.ts — LLM-assisted deduplication (spec 26).
 * Covers test cases T26-16 through T26-22.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GroceryItem } from '@/types'

// Mock callLLM before importing the module under test
vi.mock('@/lib/llm', () => ({
  callLLM: vi.fn(),
  LLM_MODEL_FAST: 'claude-haiku-4-5-20251001',
  parseLLMJsonSafe: vi.fn((text: string) => {
    try {
      const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      return JSON.parse(stripped)
    } catch {
      return null
    }
  }),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import { llmDeduplicateItems } from '../grocery-llm'
import { callLLM } from '@/lib/llm'

const mockedCallLLM = vi.mocked(callLLM)

function makeItem(overrides: Partial<GroceryItem> & Pick<GroceryItem, 'name'>): GroceryItem {
  return {
    id: crypto.randomUUID(),
    amount: null,
    unit: null,
    section: 'Other',
    isPantry: false,
    checked: false,
    recipes: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Spec 26 — llmDeduplicateItems', () => {
  it('T26-20: skips LLM call for ≤ 3 items', async () => {
    const items = [
      makeItem({ name: 'pasta', amount: 200, unit: 'g', recipes: ['A'] }),
      makeItem({ name: 'chicken', amount: 1, unit: 'lb', recipes: ['B'] }),
    ]
    const result = await llmDeduplicateItems(items)
    expect(result).toEqual(items)
    expect(mockedCallLLM).not.toHaveBeenCalled()
  })

  it('T26-16: merges "boneless skinless chicken breast" + "chicken breast"', async () => {
    const items = [
      makeItem({ name: 'boneless skinless chicken breast', amount: 1.5, unit: 'lb', recipes: ['Tacos'], recipeBreakdown: [{ recipe: 'Tacos', amount: 1.5, unit: 'lb' }] }),
      makeItem({ name: 'chicken breast', amount: 1, unit: 'lb', recipes: ['Pasta'], recipeBreakdown: [{ recipe: 'Pasta', amount: 1, unit: 'lb' }] }),
      makeItem({ name: 'onion', amount: 2, unit: null, section: 'Produce', recipes: ['Tacos'] }),
      makeItem({ name: 'garlic', amount: 3, unit: 'cloves', section: 'Produce', recipes: ['Pasta'] }),
    ]

    mockedCallLLM.mockResolvedValueOnce(JSON.stringify({
      groups: [
        { canonical: 'chicken breast', variants: ['boneless skinless chicken breast', 'chicken breast'] },
        { canonical: 'onion', variants: ['onion'] },
        { canonical: 'garlic', variants: ['garlic'] },
      ],
    }))

    const result = await llmDeduplicateItems(items)
    const chicken = result.find((i) => i.name === 'chicken breast')!
    expect(chicken).toBeDefined()
    expect(chicken.amount).toBe(2.5)
    expect(chicken.recipes).toContain('Tacos')
    expect(chicken.recipes).toContain('Pasta')
  })

  it('T26-19: LLM failure returns input unchanged', async () => {
    const items = [
      makeItem({ name: 'pasta', amount: 200, unit: 'g', recipes: ['A'] }),
      makeItem({ name: 'chicken', amount: 1, unit: 'lb', recipes: ['B'] }),
      makeItem({ name: 'onion', amount: 2, unit: null, recipes: ['C'] }),
      makeItem({ name: 'garlic', amount: 3, unit: 'cloves', recipes: ['D'] }),
    ]

    mockedCallLLM.mockRejectedValueOnce(new Error('timeout'))

    const result = await llmDeduplicateItems(items)
    expect(result).toEqual(items)
  })

  it('T26-21: recipeBreakdown arrays are concatenated when LLM merges items', async () => {
    const items = [
      makeItem({
        name: 'boneless skinless chicken breast', amount: 1.5, unit: 'lb',
        recipes: ['Tacos'],
        recipeBreakdown: [{ recipe: 'Tacos', amount: 1.5, unit: 'lb' }],
      }),
      makeItem({
        name: 'chicken breast', amount: 1, unit: 'lb',
        recipes: ['Pasta'],
        recipeBreakdown: [{ recipe: 'Pasta', amount: 1, unit: 'lb' }],
      }),
      makeItem({ name: 'onion', amount: 2, unit: null, section: 'Produce', recipes: ['Tacos'] }),
      makeItem({ name: 'garlic', amount: 3, unit: 'cloves', section: 'Produce', recipes: ['Pasta'] }),
    ]

    mockedCallLLM.mockResolvedValueOnce(JSON.stringify({
      groups: [
        { canonical: 'chicken breast', variants: ['boneless skinless chicken breast', 'chicken breast'] },
        { canonical: 'onion', variants: ['onion'] },
        { canonical: 'garlic', variants: ['garlic'] },
      ],
    }))

    const result = await llmDeduplicateItems(items)
    const chicken = result.find((i) => i.name === 'chicken breast')!
    expect(chicken.recipeBreakdown).toHaveLength(2)
    expect(chicken.recipeBreakdown![0]!.recipe).toBe('Tacos')
    expect(chicken.recipeBreakdown![1]!.recipe).toBe('Pasta')
  })

  it('T26-22: LLM merges items with different units using convertUnit', async () => {
    const items = [
      makeItem({ name: 'cheddar cheese', amount: 8, unit: 'oz', section: 'Dairy & Eggs', recipes: ['Tacos'] }),
      makeItem({ name: 'cheddar', amount: 0.5, unit: 'lb', section: 'Dairy & Eggs', recipes: ['Mac'] }),
      makeItem({ name: 'onion', amount: 2, unit: null, section: 'Produce', recipes: ['Tacos'] }),
      makeItem({ name: 'garlic', amount: 3, unit: 'cloves', section: 'Produce', recipes: ['Mac'] }),
    ]

    mockedCallLLM.mockResolvedValueOnce(JSON.stringify({
      groups: [
        { canonical: 'cheddar', variants: ['cheddar cheese', 'cheddar'] },
        { canonical: 'onion', variants: ['onion'] },
        { canonical: 'garlic', variants: ['garlic'] },
      ],
    }))

    const result = await llmDeduplicateItems(items)
    const cheddar = result.find((i) => i.name === 'cheddar')!
    expect(cheddar).toBeDefined()
    // 8 oz + 0.5 lb (= 8 oz) = 16 oz
    expect(cheddar.amount).toBe(16)
    expect(cheddar.unit).toBe('oz')
    expect(cheddar.recipes).toContain('Tacos')
    expect(cheddar.recipes).toContain('Mac')
  })

  it('T26-17: does NOT merge chicken breast + chicken thigh (identity rule)', async () => {
    const items = [
      makeItem({ name: 'chicken breast', amount: 1.5, unit: 'lb', recipes: ['Tacos'] }),
      makeItem({ name: 'chicken thigh', amount: 1, unit: 'lb', recipes: ['Curry'] }),
      makeItem({ name: 'onion', amount: 2, unit: null, section: 'Produce', recipes: ['Tacos'] }),
      makeItem({ name: 'garlic', amount: 3, unit: 'cloves', section: 'Produce', recipes: ['Curry'] }),
    ]

    // LLM correctly keeps them separate (prompt includes DO NOT merge rule)
    mockedCallLLM.mockResolvedValueOnce(JSON.stringify({
      groups: [
        { canonical: 'chicken breast', variants: ['chicken breast'] },
        { canonical: 'chicken thigh', variants: ['chicken thigh'] },
        { canonical: 'onion', variants: ['onion'] },
        { canonical: 'garlic', variants: ['garlic'] },
      ],
    }))

    const result = await llmDeduplicateItems(items)
    expect(result).toHaveLength(4)
    const breast = result.find((i) => i.name === 'chicken breast')!
    const thigh = result.find((i) => i.name === 'chicken thigh')!
    expect(breast).toBeDefined()
    expect(thigh).toBeDefined()
    expect(breast.amount).toBe(1.5)
    expect(thigh.amount).toBe(1)
  })

  it('T26-18: does NOT merge scallion + green onion (identity rule)', async () => {
    const items = [
      makeItem({ name: 'scallion', amount: 4, unit: null, section: 'Produce', recipes: ['Stir Fry'] }),
      makeItem({ name: 'green onion', amount: 3, unit: null, section: 'Produce', recipes: ['Tacos'] }),
      makeItem({ name: 'garlic', amount: 2, unit: 'cloves', section: 'Produce', recipes: ['Stir Fry'] }),
      makeItem({ name: 'ginger', amount: 1, unit: 'tbsp', recipes: ['Stir Fry'] }),
    ]

    // LLM correctly keeps them separate (prompt includes DO NOT merge rule)
    mockedCallLLM.mockResolvedValueOnce(JSON.stringify({
      groups: [
        { canonical: 'scallion', variants: ['scallion'] },
        { canonical: 'green onion', variants: ['green onion'] },
        { canonical: 'garlic', variants: ['garlic'] },
        { canonical: 'ginger', variants: ['ginger'] },
      ],
    }))

    const result = await llmDeduplicateItems(items)
    expect(result).toHaveLength(4)
    const scallion = result.find((i) => i.name === 'scallion')!
    const greenOnion = result.find((i) => i.name === 'green onion')!
    expect(scallion).toBeDefined()
    expect(greenOnion).toBeDefined()
    expect(scallion.amount).toBe(4)
    expect(greenOnion.amount).toBe(3)
  })

  it('unparseable LLM response returns items unchanged', async () => {
    const items = [
      makeItem({ name: 'pasta', amount: 200, unit: 'g', recipes: ['A'] }),
      makeItem({ name: 'chicken', amount: 1, unit: 'lb', recipes: ['B'] }),
      makeItem({ name: 'onion', amount: 2, unit: null, recipes: ['C'] }),
      makeItem({ name: 'garlic', amount: 3, unit: 'cloves', recipes: ['D'] }),
    ]

    mockedCallLLM.mockResolvedValueOnce('this is not json')

    const result = await llmDeduplicateItems(items)
    expect(result).toEqual(items)
  })

  it('single-item groups pass through unmodified', async () => {
    const items = [
      makeItem({ name: 'pasta', amount: 200, unit: 'g', recipes: ['A'] }),
      makeItem({ name: 'chicken', amount: 1, unit: 'lb', recipes: ['B'] }),
      makeItem({ name: 'onion', amount: 2, unit: null, recipes: ['C'] }),
      makeItem({ name: 'garlic', amount: 3, unit: 'cloves', recipes: ['D'] }),
    ]

    mockedCallLLM.mockResolvedValueOnce(JSON.stringify({
      groups: [
        { canonical: 'pasta', variants: ['pasta'] },
        { canonical: 'chicken', variants: ['chicken'] },
        { canonical: 'onion', variants: ['onion'] },
        { canonical: 'garlic', variants: ['garlic'] },
      ],
    }))

    const result = await llmDeduplicateItems(items)
    expect(result).toHaveLength(4)
  })
})
