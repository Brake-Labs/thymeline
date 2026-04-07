/**
 * Tests for POST /api/recipes/generate.
 * Covers spec-13 test cases: T05, T06, T07, T08, T09, T10, T11
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultMockState, defaultGetSession, makeRequest, mockHousehold } from '@/test/helpers'

const mockState = defaultMockState()

// Module-level LLM mock state
const mockLLMState = {
  response: JSON.stringify({
    title: 'Chicken Stir Fry',
    ingredients: 'chicken breast\nspinach\nsoy sauce',
    steps: 'Cook chicken\nAdd spinach',
    tags: ['Quick', 'Healthy'],
    category: 'main_dish',
    servings: 4,
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    totalTimeMinutes: 30,
    inactiveTimeMinutes: null,
    notes: 'Great weeknight meal',
  }),
  shouldThrow: false,
}

vi.mock('@/lib/llm', () => ({
  callLLM: vi.fn().mockImplementation(async () => {
    if (mockLLMState.shouldThrow) throw new Error('LLM error')
    return mockLLMState.response
  }),
  classifyLLMError: (err: unknown) => ({
    code: 'unknown',
    message: err instanceof Error ? err.message : 'LLM error',
  }),
  LLM_MODEL_CAPABLE: 'claude-sonnet-4-6',
}))

// ── Mock chain builder ───────────────────────────────────────────────────────

function mockChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  const methods = ['from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin', 'leftJoin',
    'set', 'values', 'onConflictDoUpdate', 'onConflictDoNothing', 'returning', 'groupBy']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
  )
  return chain
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => mockChain([])),
    insert: vi.fn(() => mockChain([])),
    update: vi.fn(() => mockChain([])),
    delete: vi.fn(() => mockChain([])),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

vi.mock('@/lib/auth-server', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}))

vi.mock('@/lib/household', () => mockHousehold())

vi.mock('@/lib/taste-profile', () => ({
  deriveTasteProfile: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/waste-overlap', () => ({
  detectWasteOverlap: vi.fn().mockResolvedValue(new Map()),
}))

vi.mock('@/lib/plan-utils', () => ({
  fetchCurrentWeekPlan: vi.fn().mockResolvedValue([]),
  getPlanWasteBadgeText: vi.fn().mockReturnValue(''),
}))

async function setupAuth() {
  const { auth } = await import('@/lib/auth-server')
  vi.mocked(auth.api.getSession).mockImplementation(defaultGetSession(mockState))
}

const defaultBody = {
  specific_ingredients: 'chicken breast, spinach',
  meal_type: 'dinner',
  style_hints: '',
  dietary_restrictions: [],
}

// ── T05: Returns 400 when no ingredients ──────────────────────────────────────

describe('T05 - POST /api/recipes/generate returns 400 when no ingredients', () => {
  beforeEach(async () => { vi.resetModules(); mockLLMState.shouldThrow = false; await setupAuth() })

  it('returns 400 when specific_ingredients is blank', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', {
      specific_ingredients: '',
      meal_type: 'dinner',
      style_hints: '',
      dietary_restrictions: [],
    }))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/no ingredients/i)
  })
})

// ── T06: Returns valid GeneratedRecipe on success ─────────────────────────────

describe('T06 - POST /api/recipes/generate returns a valid GeneratedRecipe', () => {
  beforeEach(async () => {
    vi.resetModules()
    mockLLMState.shouldThrow = false
    mockLLMState.response = JSON.stringify({
      title: 'Chicken Stir Fry',
      ingredients: 'chicken breast\nspinach',
      steps: 'Cook chicken\nAdd spinach',
      tags: ['Quick', 'Healthy'],
      category: 'main_dish',
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      totalTimeMinutes: 30,
      inactiveTimeMinutes: null,
      notes: 'Great weeknight meal',
    })
    await setupAuth()
  })

  it('returns 200 with a GeneratedRecipe shape', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', defaultBody))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.title).toBe('Chicken Stir Fry')
    expect(json.ingredients).toBe('chicken breast\nspinach')
    expect(json.steps).toBe('Cook chicken\nAdd spinach')
    expect(json.category).toBe('main_dish')
    expect(json.servings).toBe(4)
    expect(json.prep_time_minutes).toBe(10)
    expect(json.cook_time_minutes).toBe(20)
    expect(json.total_time_minutes).toBe(30)
    expect(json.inactive_time_minutes).toBeNull()
    expect(json.notes).toBe('Great weeknight meal')
  })
})

// ── T07: Tags filtered to FIRST_CLASS_TAGS ────────────────────────────────────

describe('T07 - Tags returned by LLM are filtered to FIRST_CLASS_TAGS', () => {
  beforeEach(async () => {
    vi.resetModules()
    mockLLMState.shouldThrow = false
    mockLLMState.response = JSON.stringify({
      title: 'Test Recipe',
      ingredients: 'pasta',
      steps: 'Cook it',
      tags: ['Quick', 'Gluten-Free', 'InvalidTag', 'AnotherBadTag'],
      category: 'main_dish',
      servings: 2,
      prepTimeMinutes: 5,
      cookTimeMinutes: 15,
      totalTimeMinutes: 20,
      inactiveTimeMinutes: null,
      notes: null,
    })
    await setupAuth()
  })

  it('drops unrecognised tags, keeps valid ones', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', defaultBody))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.tags).toContain('Quick')
    expect(json.tags).toContain('Gluten-Free')
    expect(json.tags).not.toContain('InvalidTag')
    expect(json.tags).not.toContain('AnotherBadTag')
  })
})

// ── T08: Invalid LLM category falls back to mealTypeToCategory ───────────────

describe('T08 - Invalid LLM category falls back to mealTypeToCategory("dinner")', () => {
  beforeEach(async () => {
    vi.resetModules()
    mockLLMState.shouldThrow = false
    mockLLMState.response = JSON.stringify({
      title: 'Test Recipe',
      ingredients: 'pasta',
      steps: 'Cook it',
      tags: [],
      category: 'invalid_category',
      servings: 2,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      totalTimeMinutes: null,
      inactiveTimeMinutes: null,
      notes: null,
    })
    await setupAuth()
  })

  it('returns main_dish when LLM category is invalid and meal_type is dinner', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', defaultBody))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.category).toBe('main_dish')
  })
})

// ── T09: mealType → category mapping ─────────────────────────────────────────

describe('T09 - All mealType → category mappings are correct', () => {
  const mappings: Array<{ mealType: string; expectedCategory: string }> = [
    { mealType: 'dinner',    expectedCategory: 'main_dish' },
    { mealType: 'lunch',     expectedCategory: 'main_dish' },
    { mealType: 'breakfast', expectedCategory: 'breakfast' },
    { mealType: 'snack',     expectedCategory: 'side_dish' },
    { mealType: 'dessert',   expectedCategory: 'dessert'   },
  ]

  mappings.forEach(({ mealType, expectedCategory }) => {
    it(`${mealType} → ${expectedCategory}`, async () => {
      vi.resetModules()
      mockLLMState.shouldThrow = false
      mockLLMState.response = JSON.stringify({
        title: 'Test', ingredients: 'x', steps: 'y',
        tags: [], category: 'invalid', servings: null,
        prepTimeMinutes: null, cookTimeMinutes: null,
        totalTimeMinutes: null, inactiveTimeMinutes: null, notes: null,
      })

      await setupAuth()

      const { POST } = await import('../route')
      const res = await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', { ...defaultBody, meal_type: mealType }))

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.category).toBe(expectedCategory)
    })
  })
})

// ── T10: Returns 500 when LLM throws ─────────────────────────────────────────

describe('T10 - POST /api/recipes/generate returns 500 when LLM call throws', () => {
  beforeEach(async () => {
    vi.resetModules()
    mockLLMState.shouldThrow = true
    await setupAuth()
  })

  it('returns 500 on LLM error', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', defaultBody))

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/recipe generation failed/i)
  })
})

// ── T11: Returns 500 when LLM returns unparseable JSON ────────────────────────

describe('T11 - POST /api/recipes/generate returns 500 when LLM returns unparseable JSON', () => {
  beforeEach(async () => {
    vi.resetModules()
    mockLLMState.shouldThrow = false
    mockLLMState.response = 'not valid json at all }{{'
    await setupAuth()
  })

  it('returns 500 on parse failure', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', defaultBody))

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/recipe generation failed/i)
  })
})

// ── T12: Tweak request — user message references previous recipe ───────────────

describe('T12 - POST /api/recipes/generate with tweak_request references previous recipe in LLM message', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mockLLMState.shouldThrow = false
    mockLLMState.response = JSON.stringify({
      title: 'Revised Stir Fry',
      ingredients: 'chicken breast\nspinach',
      steps: 'Cook chicken\nAdd spinach',
      tags: ['Quick'],
      category: 'main_dish',
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      totalTimeMinutes: 30,
      inactiveTimeMinutes: null,
      notes: null,
    })
    await setupAuth()
  })

  it('passes tweak_request and previous_recipe in the LLM user message', async () => {
    const { POST } = await import('../route')
    await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', {
      ...defaultBody,
      tweak_request: 'remove the chickpeas',
      previous_recipe: {
        title: 'Original Stir Fry',
        ingredients: 'chicken breast\nchickpeas\nspinach',
        steps: 'Cook chicken\nAdd chickpeas\nAdd spinach',
      },
    }))

    const { callLLM } = await import('@/lib/llm')
    expect(vi.mocked(callLLM)).toHaveBeenCalled()
    const callArgs = vi.mocked(callLLM).mock.calls[0]![0]
    expect(callArgs.user).toContain('remove the chickpeas')
    expect(callArgs.user).toContain('Original Stir Fry')
    expect(callArgs.user).toContain('You previously generated this recipe')
  })

  it('returns revised recipe on success', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', {
      ...defaultBody,
      tweak_request: 'add more spice',
      previous_recipe: {
        title: 'Original Stir Fry',
        ingredients: 'chicken breast\nspinach',
        steps: 'Cook chicken\nAdd spinach',
      },
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.title).toBe('Revised Stir Fry')
  })
})

// ── T13: No tweak fields → standard user message ──────────────────────────────

describe('T13 - POST /api/recipes/generate without tweak fields uses standard user message', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mockLLMState.shouldThrow = false
    mockLLMState.response = JSON.stringify({
      title: 'Chicken Stir Fry',
      ingredients: 'chicken breast\nspinach',
      steps: 'Cook chicken\nAdd spinach',
      tags: [],
      category: 'main_dish',
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      totalTimeMinutes: 30,
      inactiveTimeMinutes: null,
      notes: null,
    })
    await setupAuth()
  })

  it('does not include tweak language in LLM message when no tweak fields provided', async () => {
    const { POST } = await import('../route')
    await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', defaultBody))

    const { callLLM } = await import('@/lib/llm')
    expect(vi.mocked(callLLM)).toHaveBeenCalled()
    const callArgs = vi.mocked(callLLM).mock.calls[0]![0]
    expect(callArgs.user).not.toContain('You previously generated this recipe')
    expect(callArgs.user).toContain('Generate a dinner recipe')
  })
})
