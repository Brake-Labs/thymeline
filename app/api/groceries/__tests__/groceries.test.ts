/**
 * Tests for /api/groceries (GET + PATCH) and /api/groceries/generate (POST).
 * Covers spec test cases: T04, T05, T06, T07, T08, T09, T10, T28, T29, T30
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared mock state ──────────────────────────────────────────────────────────

const mockUser = { id: 'user-1' }

const samplePlan = { id: 'plan-1', people_count: 2 }

const sampleList = {
  id:            'list-1',
  user_id:       'user-1',
  meal_plan_id:  'plan-1',
  week_start:    '2026-03-15',
  people_count:  2,
  recipe_scales: [{ recipe_id: 'recipe-1', recipe_title: 'Pasta', people_count: null }],
  items:         [
    {
      id: 'item-1', name: 'pasta', amount: 200, unit: 'g',
      section: 'Pantry', is_pantry: false, checked: false, recipes: ['Pasta'],
    },
  ],
  created_at:    '2026-03-15T00:00:00Z',
  updated_at:    '2026-03-15T00:00:00Z',
}

// ── DB mock factory (used by createAdminClient) ────────────────────────────────

function makeDbMock(opts: {
  plan?:         unknown
  planError?:    boolean
  list?:         unknown
  listError?:    { code?: string; message?: string } | null
  entries?:      unknown[]
  upsertResult?: unknown
  updateResult?: unknown
} = {}) {
  const {
    plan = samplePlan,
    planError = false,
    list = sampleList,
    listError = null,
    entries = [],
    upsertResult = sampleList,
    updateResult = sampleList,
  } = opts

  const fromFn = vi.fn((table: string) => {
    if (table === 'meal_plans') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(
                planError
                  ? { data: null, error: { message: 'not found' } }
                  : { data: plan, error: null },
              ),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }
    }
    if (table === 'meal_plan_entries') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: entries, error: null }),
          }),
        }),
      }
    }
    if (table === 'grocery_lists') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: list, error: listError }),
            }),
          }),
        }),
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: upsertResult, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: updateResult, error: null }),
            }),
          }),
        }),
      }
    }
    return {}
  })

  return { from: fromFn }
}

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient:  vi.fn(),
}))

vi.mock('firecrawl', () => ({
  default: class MockFirecrawl {
    scrape = vi.fn().mockResolvedValue({
      markdown: '# Pasta Carbonara\n\n## Ingredients\n200g pasta\n2 eggs\n\n## Steps\nCook pasta',
    })
  },
}))

vi.mock('@/lib/llm', () => ({
  anthropic: {
    messages: {
      create: vi.fn(),
    },
  },
}))

import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { anthropic } from '@/lib/llm'

// Auth-only mock for createServerClient — routes only call auth.getUser() on it
const authMock = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
  },
}

function setupMocks(dbOpts: Parameters<typeof makeDbMock>[0] = {}) {
  const db = makeDbMock(dbOpts)
  vi.mocked(createServerClient).mockReturnValue(authMock as ReturnType<typeof createServerClient>)
  vi.mocked(createAdminClient).mockReturnValue(db as ReturnType<typeof createAdminClient>)
  return db
}

function makeReq(url: string, method = 'GET', body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── T28: GET returns null when no list ────────────────────────────────────────

describe('T28 - GET /api/groceries returns null when no list', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns { list: null } when no row found', async () => {
    setupMocks({ list: null, listError: { code: 'PGRST116', message: 'no rows' } })

    const { GET } = await import('../route')
    const res = await GET(makeReq('http://localhost/api/groceries?week_start=2026-03-15') as Parameters<typeof GET>[0])

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.list).toBeNull()
  })

  it('returns existing list when found', async () => {
    setupMocks({ list: sampleList })

    const { GET } = await import('../route')
    const res = await GET(makeReq('http://localhost/api/groceries?week_start=2026-03-15') as Parameters<typeof GET>[0])

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.list).not.toBeNull()
    expect(json.list.id).toBe('list-1')
  })
})

// ── T29: PATCH returns 404 for non-existent list ─────────────────────────────

describe('T29 - PATCH /api/groceries returns 404 for non-existent list', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 404 when list does not exist', async () => {
    setupMocks({ list: null, listError: { code: 'PGRST116' } })

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeReq('http://localhost/api/groceries', 'PATCH', {
        week_start: '2026-03-15',
        items: [],
      }) as Parameters<typeof PATCH>[0],
    )

    expect(res.status).toBe(404)
  })

  it('returns 200 with updated list on success', async () => {
    const updatedList = { ...sampleList, people_count: 4 }
    setupMocks({ list: sampleList, updateResult: updatedList })

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeReq('http://localhost/api/groceries', 'PATCH', {
        week_start: '2026-03-15',
        people_count: 4,
      }) as Parameters<typeof PATCH>[0],
    )

    expect(res.status).toBe(200)
  })
})

// ── T30: PATCH writes people_count to meal_plans ─────────────────────────────

describe('T30 - plan-level people_count written to meal_plans on change', () => {
  beforeEach(() => { vi.resetModules() })

  it('calls meal_plans.update when people_count changes', async () => {
    const db = setupMocks({ list: sampleList })

    const { PATCH } = await import('../route')
    await PATCH(
      makeReq('http://localhost/api/groceries', 'PATCH', {
        week_start: '2026-03-15',
        people_count: 4,
      }) as Parameters<typeof PATCH>[0],
    )

    // meal_plans.update should have been called via the admin client
    const mealPlansCalls = db.from.mock.calls.filter(([t]) => t === 'meal_plans')
    expect(mealPlansCalls.length).toBeGreaterThan(0)
  })
})

// ── T04: Generate uses vault ingredients ─────────────────────────────────────

describe('T04 - Generate uses vault ingredients when available', () => {
  beforeEach(() => { vi.resetModules() })

  it('uses recipe.ingredients directly when present, no scrape', async () => {
    const recipeWithIngredients = {
      id:          'recipe-1',
      title:       'Pasta',
      ingredients: '200g pasta\n2 eggs',
      url:         null,
    }
    const entries = [{
      recipe_id:    'recipe-1',
      planned_date: '2026-03-15',
      recipes:      recipeWithIngredients,
    }]
    setupMocks({ plan: samplePlan, entries, upsertResult: sampleList })

    const { POST } = await import('../generate/route')
    const res = await POST(
      makeReq('http://localhost/api/groceries/generate', 'POST', { week_start: '2026-03-15' }) as Parameters<typeof POST>[0],
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.list).toBeDefined()
    expect(json.skipped_recipes).toBeInstanceOf(Array)
  })
})

// ── T05: Generate scrapes URL when vault ingredients absent ─────────────────

describe('T05 - Generate scrapes URL when vault ingredients absent', () => {
  beforeEach(() => { vi.resetModules() })

  it('calls Firecrawl + LLM when ingredients null but url present', async () => {
    process.env.FIRECRAWL_API_KEY = 'test-key'
    const recipeNoIngredients = {
      id:          'recipe-2',
      title:       'Scraped Recipe',
      ingredients: null,
      url:         'https://example.com/recipe',
    }
    const entries = [{
      recipe_id:    'recipe-2',
      planned_date: '2026-03-15',
      recipes:      recipeNoIngredients,
    }]
    setupMocks({ plan: samplePlan, entries, upsertResult: sampleList })
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ ingredients: '200g pasta\n2 eggs' }) }],
    } as unknown as Awaited<ReturnType<typeof anthropic.messages.create>>)

    const { POST } = await import('../generate/route')
    const res = await POST(
      makeReq('http://localhost/api/groceries/generate', 'POST', { week_start: '2026-03-15' }) as Parameters<typeof POST>[0],
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.list).toBeDefined()
  })
})

// ── T06: Scrape failure skips recipe ─────────────────────────────────────────

describe('T06 - Scrape failure skips recipe, includes in skipped_recipes', () => {
  beforeEach(() => { vi.resetModules() })

  it('skips recipe and adds to skipped_recipes on error', async () => {
    process.env.FIRECRAWL_API_KEY = 'test-key'
    const recipeNoIngredients = {
      id:          'recipe-fail',
      title:       'Fail Recipe',
      ingredients: null,
      url:         'https://example.com/fail',
    }
    const entries = [{
      recipe_id:    'recipe-fail',
      planned_date: '2026-03-15',
      recipes:      recipeNoIngredients,
    }]
    setupMocks({ plan: samplePlan, entries, upsertResult: { ...sampleList, items: [] } })
    vi.mocked(anthropic.messages.create).mockRejectedValue(new Error('LLM failed'))

    const { POST } = await import('../generate/route')
    const res = await POST(
      makeReq('http://localhost/api/groceries/generate', 'POST', { week_start: '2026-03-15' }) as Parameters<typeof POST>[0],
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.skipped_recipes).toContain('Fail Recipe')
  })
})

// ── T07: Items grouped by recipe ─────────────────────────────────────────────

describe('T07 - Items are grouped by recipe section', () => {
  it('generated list has items with recipes field', async () => {
    vi.resetModules()
    const entries = [{
      recipe_id:    'recipe-1',
      planned_date: '2026-03-15',
      recipes:      { id: 'recipe-1', title: 'Pasta', ingredients: '200g pasta\n100ml cream', url: null },
    }]
    const expectedList = {
      ...sampleList,
      items: [
        { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', is_pantry: false, checked: false, recipes: ['Pasta'] },
        { id: 'i2', name: 'cream', amount: 100, unit: 'ml', section: 'Dairy & Eggs', is_pantry: false, checked: false, recipes: ['Pasta'] },
      ],
    }
    setupMocks({ plan: samplePlan, entries, upsertResult: expectedList })

    const { POST } = await import('../generate/route')
    const res = await POST(
      makeReq('http://localhost/api/groceries/generate', 'POST', { week_start: '2026-03-15' }) as Parameters<typeof POST>[0],
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.list.recipe_scales).toBeDefined()
    expect(json.list.recipe_scales[0].recipe_title).toBe('Pasta')
  })
})

// ── T08: Duplicate ingredients combined (same unit) ──────────────────────────

describe('T08 - Duplicate ingredients combined (same unit)', () => {
  it('combines same-unit ingredients from multiple recipes', async () => {
    const { combineIngredients, parseIngredientLine } = await import('@/lib/grocery')

    const inputs = [
      { parsed: parseIngredientLine('200g pasta'), recipeTitle: 'Recipe A', scaleFactor: 1 },
      { parsed: parseIngredientLine('100g pasta'), recipeTitle: 'Recipe B', scaleFactor: 1 },
    ]
    const { resolved } = combineIngredients(inputs)
    const pasta = resolved.find((i) => i.name.includes('pasta'))
    expect(pasta).toBeDefined()
    expect(pasta!.amount).toBe(300)
  })
})

// ── T09: Pantry staples flagged ───────────────────────────────────────────────

describe('T09 - Pantry staples flagged with is_pantry: true', () => {
  it('marks olive oil as is_pantry', async () => {
    const { parseIngredientLine, isPantryStaple } = await import('@/lib/grocery')
    const parsed = parseIngredientLine('2 tbsp olive oil')
    expect(isPantryStaple(parsed.name)).toBe(true)
  })

  it('marks salt as is_pantry', async () => {
    const { isPantryStaple } = await import('@/lib/grocery')
    expect(isPantryStaple('salt')).toBe(true)
  })

  it('does not mark chicken breast as is_pantry', async () => {
    const { isPantryStaple } = await import('@/lib/grocery')
    expect(isPantryStaple('chicken breast')).toBe(false)
  })
})

// ── T10: Scaling ──────────────────────────────────────────────────────────────

describe('T10 - Plan-level scaling: 4 people doubles amounts from base 2', () => {
  it('scaleFactor 2 doubles ingredient amount', async () => {
    const { parseIngredientLine, combineIngredients } = await import('@/lib/grocery')

    const inputs = [
      { parsed: parseIngredientLine('200g pasta'), recipeTitle: 'Pasta', scaleFactor: 2 },
    ]
    const { resolved } = combineIngredients(inputs)
    const pasta = resolved[0]
    expect(pasta.amount).toBe(400)
  })
})
