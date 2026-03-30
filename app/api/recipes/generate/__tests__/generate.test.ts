/**
 * Tests for POST /api/recipes/generate.
 * Covers spec-13 test cases: T05, T06, T07, T08, T09, T10, T11
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }

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

vi.mock('@anthropic-ai/sdk', () => ({
  default: function MockAnthropic(this: { messages: { create: () => Promise<unknown> } }) {
    this.messages = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async (): Promise<any> => {
        if (mockLLMState.shouldThrow) throw new Error('LLM error')
        return { content: [{ type: 'text', text: mockLLMState.response }] }
      },
    }
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: async () => null,
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
}))

import { createServerClient, createAdminClient } from '@/lib/supabase-server'

function makeAuthMock(pantryItems: unknown[] = []) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'pantry_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: pantryItems, error: null }),
            }),
          }),
        }
      }
      return {}
    }),
  }
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/recipes/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: JSON.stringify(body),
  })
}

const defaultBody = {
  use_pantry: false,
  specific_ingredients: 'chicken breast, spinach',
  meal_type: 'dinner',
  style_hints: '',
  dietary_restrictions: [],
}

// ── T05: Returns 400 when no ingredients ──────────────────────────────────────

describe('T05 - POST /api/recipes/generate returns 400 when no ingredients', () => {
  beforeEach(() => { vi.resetModules(); mockLLMState.shouldThrow = false })

  it('returns 400 when use_pantry is false and specific_ingredients is blank', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(makeReq({
      use_pantry: false,
      specific_ingredients: '',
      meal_type: 'dinner',
      style_hints: '',
      dietary_restrictions: [],
    }) as Parameters<typeof POST>[0])

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/no ingredients/i)
  })

  it('returns 400 when use_pantry is true but pantry is empty and specific_ingredients is blank', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock([]) as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAuthMock([]) as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(makeReq({
      use_pantry: true,
      specific_ingredients: '  ',
      meal_type: 'dinner',
      style_hints: '',
      dietary_restrictions: [],
    }) as Parameters<typeof POST>[0])

    expect(res.status).toBe(400)
  })
})

// ── T06: Returns valid GeneratedRecipe on success ─────────────────────────────

describe('T06 - POST /api/recipes/generate returns a valid GeneratedRecipe', () => {
  beforeEach(() => {
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
  })

  it('returns 200 with a GeneratedRecipe shape', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(makeReq(defaultBody) as Parameters<typeof POST>[0])

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
  beforeEach(() => {
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
  })

  it('drops unrecognised tags, keeps valid ones', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(makeReq(defaultBody) as Parameters<typeof POST>[0])

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
  beforeEach(() => {
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
  })

  it('returns main_dish when LLM category is invalid and meal_type is dinner', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(makeReq(defaultBody) as Parameters<typeof POST>[0])

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
      // Return invalid category so fallback fires
      mockLLMState.response = JSON.stringify({
        title: 'Test', ingredients: 'x', steps: 'y',
        tags: [], category: 'invalid', servings: null,
        prepTimeMinutes: null, cookTimeMinutes: null,
        totalTimeMinutes: null, inactiveTimeMinutes: null, notes: null,
      })

      vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createServerClient>)
      vi.mocked(createAdminClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createAdminClient>)

      const { POST } = await import('../route')
      const res = await POST(makeReq({ ...defaultBody, meal_type: mealType }) as Parameters<typeof POST>[0])

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.category).toBe(expectedCategory)
    })
  })
})

// ── T10: Returns 500 when LLM throws ─────────────────────────────────────────

describe('T10 - POST /api/recipes/generate returns 500 when LLM call throws', () => {
  beforeEach(() => {
    vi.resetModules()
    mockLLMState.shouldThrow = true
  })

  it('returns 500 on LLM error', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(makeReq(defaultBody) as Parameters<typeof POST>[0])

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/recipe generation failed/i)
  })
})

// ── T11: Returns 500 when LLM returns unparseable JSON ────────────────────────

describe('T11 - POST /api/recipes/generate returns 500 when LLM returns unparseable JSON', () => {
  beforeEach(() => {
    vi.resetModules()
    mockLLMState.shouldThrow = false
    mockLLMState.response = 'not valid json at all }{{'
  })

  it('returns 500 on parse failure', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAuthMock() as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(makeReq(defaultBody) as Parameters<typeof POST>[0])

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/recipe generation failed/i)
  })
})
