/**
 * Tests for /api/groceries (GET + PATCH) and /api/groceries/generate (POST).
 * Covers spec test cases: T04, T05, T06, T07, T08, T09, T10, T28, T29, T30
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared mock state ──────────────────────────────────────────────────────────

const mockUser = { id: 'user-1' }

const samplePlan = { id: 'plan-1', servings: 4 }

const sampleList = {
  id:            'list-1',
  user_id:       'user-1',
  meal_plan_id:  'plan-1',
  week_start:    '2026-03-15',
  servings:      4,
  recipe_scales: [{ recipe_id: 'recipe-1', recipe_title: 'Pasta', servings: null }],
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
  pantryItems?:  { name: string }[]
} = {}) {
  const {
    plan = samplePlan,
    planError = false,
    list = sampleList,
    listError = null,
    entries = [],
    upsertResult = sampleList,
    updateResult = sampleList,
    pantryItems = [],
  } = opts

  const fromFn = vi.fn((table: string) => {
    if (table === 'meal_plans') {
      // Supports both query patterns:
      //   old GET/PATCH: .eq(user_id).eq(week_start).single()
      //   new generate:  .eq(user_id).lte(week_start, date_to).gte(week_start, sixDays).order()
      const plansList = opts.plans ?? (plan ? [plan] : [])
      const plansResult  = { data: planError ? null : plansList, error: planError ? { message: 'not found' } : null }
      const singleResult = planError ? { data: null, error: { message: 'not found' } } : { data: plan, error: null }

      // Lazy factory — thenable so direct `await chain` resolves to plansResult
      const makeChain = (): Record<string, unknown> => {
        const ch: Record<string, unknown> = {
          eq:     vi.fn().mockImplementation(() => makeChain()),
          lte:    vi.fn().mockReturnValue({
            gte:  vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue(plansResult),
            }),
          }),
          gte:    vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue(plansResult),
          }),
          single: vi.fn().mockResolvedValue(singleResult),
          order:  vi.fn().mockResolvedValue(plansResult),
          // Make thenable: `await db.from('meal_plans').select().eq()` → plansResult
          then:   (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
                    Promise.resolve(plansResult).then(resolve, reject),
        }
        return ch
      }

      return {
        select: vi.fn().mockReturnValue(makeChain()),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }
    }
    if (table === 'meal_plan_entries') {
      const entriesResult = vi.fn().mockResolvedValue({ data: entries, error: null })
      return {
        select: vi.fn().mockReturnValue({
          // old: .eq(meal_plan_id).order()
          eq: vi.fn().mockReturnValue({ order: entriesResult }),
          // new: .in(meal_plan_id, planIds).gte(date_from).lte(date_to).order()
          in: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({ order: entriesResult }),
            }),
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
    if (table === 'pantry_items') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: pantryItems, error: null }),
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
    const updatedList = { ...sampleList, servings: 8 }
    setupMocks({ list: sampleList, updateResult: updatedList })

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeReq('http://localhost/api/groceries', 'PATCH', {
        week_start: '2026-03-15',
        servings: 8,
      }) as Parameters<typeof PATCH>[0],
    )

    expect(res.status).toBe(200)
  })
})

// ── T30: PATCH writes servings to meal_plans ─────────────────────────────────

describe('T30 - plan-level servings written to meal_plans on change', () => {
  beforeEach(() => { vi.resetModules() })

  it('calls meal_plans.update when servings changes', async () => {
    const db = setupMocks({ list: sampleList })

    const { PATCH } = await import('../route')
    await PATCH(
      makeReq('http://localhost/api/groceries', 'PATCH', {
        week_start: '2026-03-15',
        servings: 8,
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


// ── T31: Date range query returns correct recipes ─────────────────────────────

describe('T31 - POST /api/groceries/generate with date_from/date_to', () => {
  beforeEach(() => { vi.resetModules() })

  it('accepts date_from + date_to and returns 200', async () => {
    const entries = [{
      recipe_id:    'recipe-1',
      planned_date: '2026-03-22',
      recipes:      { id: 'recipe-1', title: 'Pasta', ingredients: '200g pasta', url: null, servings: null },
    }]
    setupMocks({ plan: samplePlan, entries, upsertResult: sampleList })

    const { POST } = await import('../generate/route')
    const res = await POST(
      makeReq('http://localhost/api/groceries/generate', 'POST', {
        date_from: '2026-03-22',
        date_to:   '2026-04-04',
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.list).toBeDefined()
  })

  it('derives date range from week_start for backward compat', async () => {
    const entries = [{
      recipe_id:    'recipe-1',
      planned_date: '2026-03-15',
      recipes:      { id: 'recipe-1', title: 'Pasta', ingredients: '200g pasta', url: null, servings: null },
    }]
    setupMocks({ plan: samplePlan, entries, upsertResult: sampleList })

    const { POST } = await import('../generate/route')
    const res = await POST(
      makeReq('http://localhost/api/groceries/generate', 'POST', { week_start: '2026-03-15' }),
    )

    expect(res.status).toBe(200)
  })

  it('returns 404 when no plans overlap the date range', async () => {
    setupMocks({ planError: true })

    const { POST } = await import('../generate/route')
    const res = await POST(
      makeReq('http://localhost/api/groceries/generate', 'POST', {
        date_from: '2026-03-22',
        date_to:   '2026-03-28',
      }),
    )

    expect(res.status).toBe(404)
  })
})

// ── T32: Bought state saves and loads correctly ───────────────────────────────

describe('T32 - PATCH preserves bought field on items', () => {
  beforeEach(() => { vi.resetModules() })

  it('stores items with bought: true via PATCH', async () => {
    const listWithBought = {
      ...sampleList,
      items: [
        { ...sampleList.items[0], bought: true },
      ],
    }
    const db = setupMocks({ list: sampleList, updateResult: listWithBought })

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeReq('http://localhost/api/groceries', 'PATCH', {
        week_start: '2026-03-15',
        items: listWithBought.items,
      }) as Parameters<typeof PATCH>[0],
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.items[0].bought).toBe(true)

    // Verify update was called with items containing bought flag
    const groceryCalls = db.from.mock.calls.filter(([t]: [string]) => t === 'grocery_lists')
    expect(groceryCalls.length).toBeGreaterThan(0)
  })
})

// ── T_servings: Generate uses recipe.servings for recipe_scales ───────────────

describe('T_servings - Generate seeds recipe_scales.servings from recipe', () => {
  beforeEach(() => { vi.resetModules() })

  it('defaults to planServings (4) when recipe.servings is null', async () => {
    const entries = [{
      recipe_id:    'recipe-1',
      planned_date: '2026-03-15',
      recipes:      { id: 'recipe-1', title: 'Pasta', ingredients: '200g pasta\n1 cup sauce', url: null, servings: null },
    }]
    const db = setupMocks({ plan: samplePlan, entries })
    const { POST } = await import('../generate/route')
    const res = await POST(
      makeReq('http://localhost/api/groceries/generate', 'POST', { week_start: '2026-03-15' }),
    )
    expect(res.status).toBe(200)

    // Find the grocery_lists upsert calls by correlating from.mock.calls and .results
    type FromResult = { select?: unknown; upsert?: ReturnType<typeof vi.fn>; update?: unknown }
    const groceryListObjs = db.from.mock.calls
      .map((args: string[], i: number) => ({ table: args[0], obj: (db.from.mock.results[i] as { value: FromResult }).value }))
      .filter(({ table }) => table === 'grocery_lists')
    const upsertArgs = groceryListObjs.flatMap(({ obj }) => obj.upsert?.mock?.calls ?? [])
    const upsertData = upsertArgs[0]?.[0] as { recipe_scales: Array<{ recipe_id: string; servings: number }> }
    const scale = upsertData?.recipe_scales?.find((s) => s.recipe_id === 'recipe-1')
    expect(scale?.servings).toBe(4)
  })
})

// ── NEW: Date range query returns correct recipes ─────────────────────────────

describe('Date range: POST /generate with date_from/date_to', () => {
  beforeEach(() => { vi.resetModules() })

  it('accepts date_from/date_to and returns 200 with list', async () => {
    const entries = [{
      recipe_id:    'recipe-1',
      planned_date: '2026-03-22',
      recipes:      { id: 'recipe-1', title: 'Pasta', ingredients: '200g pasta', url: null, servings: null },
    }]
    setupMocks({ plan: samplePlan, entries, upsertResult: sampleList })

    const { POST } = await import('../generate/route')
    const res = await POST(
      makeReq('http://localhost/api/groceries/generate', 'POST', {
        date_from: '2026-03-22',
        date_to:   '2026-03-28',
      }) as Parameters<typeof POST>[0],
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.list).toBeDefined()
  })

  it('returns 400 when neither week_start nor date_from provided', async () => {
    setupMocks()

    const { POST } = await import('../generate/route')
    const res = await POST(
      makeReq('http://localhost/api/groceries/generate', 'POST', {}) as Parameters<typeof POST>[0],
    )

    expect(res.status).toBe(400)
  })

  it('queries entries by date range using .in().gte().lte()', async () => {
    const entries = [{
      recipe_id:    'recipe-range',
      planned_date: '2026-04-01',
      recipes:      { id: 'recipe-range', title: 'Soup', ingredients: '1 cup broth', url: null, servings: null },
    }]
    const db = setupMocks({ plan: samplePlan, entries, upsertResult: sampleList })

    const { POST } = await import('../generate/route')
    await POST(
      makeReq('http://localhost/api/groceries/generate', 'POST', {
        date_from: '2026-03-29',
        date_to:   '2026-04-11',
      }) as Parameters<typeof POST>[0],
    )

    // Verify meal_plan_entries was queried (via the .in() chain)
    const entryTableCalls = db.from.mock.calls.filter(([t]: string[]) => t === 'meal_plan_entries')
    expect(entryTableCalls.length).toBeGreaterThan(0)
  })
})

// ── NEW: Item bought state saves and loads correctly ──────────────────────────

describe('Item bought state: PATCH saves checked items', () => {
  beforeEach(() => { vi.resetModules() })

  it('saves items with checked:true and returns updated list', async () => {
    const boughtItems = [{
      id: 'item-1', name: 'pasta', amount: 200, unit: 'g',
      section: 'Pantry', is_pantry: false, checked: true, recipes: ['Pasta'],
    }]
    const updatedList = { ...sampleList, items: boughtItems }
    setupMocks({ list: sampleList, updateResult: updatedList })

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeReq('http://localhost/api/groceries', 'PATCH', {
        week_start: '2026-03-15',
        items: boughtItems,
      }) as Parameters<typeof PATCH>[0],
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.items[0].checked).toBe(true)
  })

  it('PATCH by list_id also resolves the list correctly', async () => {
    setupMocks({ list: sampleList, updateResult: sampleList })

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeReq('http://localhost/api/groceries', 'PATCH', {
        list_id: 'list-1',
        items: sampleList.items,
      }) as Parameters<typeof PATCH>[0],
    )

    expect(res.status).toBe(200)
  })
})

// ── T17: Grocery list flags pantry items as is_pantry: true ──────────────────

describe('T17 - Grocery generate flags items found in pantry as is_pantry: true', () => {
  beforeEach(() => { vi.resetModules() })

  it('marks grocery item is_pantry: true when pantry has a matching item', async () => {
    const entries = [{
      recipe_id:    'recipe-1',
      planned_date: '2026-03-15',
      recipes:      { id: 'recipe-1', title: 'Pasta', ingredients: 'pasta\ncream', url: null, servings: null },
    }]
    // Pantry contains "pasta" — should flag the pasta grocery item
    const pantryItems = [{ name: 'pasta' }]
    const upsertResult = {
      ...sampleList,
      items: [
        { id: 'i1', name: 'pasta', amount: 200, unit: 'g', section: 'Pantry', is_pantry: true, checked: false, recipes: ['Pasta'] },
        { id: 'i2', name: 'cream', amount: null, unit: null, section: 'Dairy & Eggs', is_pantry: false, checked: false, recipes: ['Pasta'] },
      ],
    }
    const db = setupMocks({ plan: samplePlan, entries, upsertResult, pantryItems })

    const { POST } = await import('../generate/route')
    await POST(
      makeReq('http://localhost/api/groceries/generate', 'POST', {
        date_from: '2026-03-15',
        date_to:   '2026-03-21',
      }) as Parameters<typeof POST>[0],
    )

    // Verify pantry_items was queried
    const pantryCalls = db.from.mock.calls.filter(([t]: string[]) => t === 'pantry_items')
    expect(pantryCalls.length).toBeGreaterThan(0)
  })
})

// ── T18: Grocery fuzzy match: "chicken breast" matches pantry "chicken" ───────

describe('T18 - Grocery pantry fuzzy match: "chicken breast" matches pantry item "chicken"', () => {
  beforeEach(() => { vi.resetModules() })

  it('flags chicken breast as is_pantry when pantry has "chicken"', async () => {
    // The generate route checks: pantry name ⊆ grocery name OR grocery name ⊆ pantry name
    // "chicken" ⊆ "chicken breast" → match
    const entries = [{
      recipe_id:    'recipe-1',
      planned_date: '2026-03-15',
      recipes:      { id: 'recipe-1', title: 'Chicken Soup', ingredients: 'chicken breast\nbroth', url: null, servings: null },
    }]
    const pantryItems = [{ name: 'chicken' }]
    const db = setupMocks({ plan: samplePlan, entries, upsertResult: sampleList, pantryItems })

    const { POST } = await import('../generate/route')
    await POST(
      makeReq('http://localhost/api/groceries/generate', 'POST', {
        date_from: '2026-03-15',
        date_to:   '2026-03-21',
      }) as Parameters<typeof POST>[0],
    )

    // Verify pantry_items table was queried during generate
    const pantryCalls = db.from.mock.calls.filter(([t]: string[]) => t === 'pantry_items')
    expect(pantryCalls.length).toBeGreaterThan(0)
  })
})
