/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock state ─────────────────────────────────────────────────────────────────

const mockState = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test', image: null } as { id: string; email: string; name: string; image: null } | null,
  recipes: [] as { id: string; title: string; tags: string[]; category: string }[],
  recentHistory: [] as { recipe_id: string; made_on: string; recipes: { title: string } }[],
  pantryItems: [] as { name: string; expiry_date: string | null }[],
  prefs: {
    user_id: 'user-1',
    options_per_day: 3,
    cooldown_days: 0, // 0 = no cooldown for tests
    seasonal_mode: false,
    preferred_tags: [],
    avoided_tags: [],
    limited_tags: [],
    seasonal_rules: null,
    onboarding_completed: true,
    is_active: true,
  },
  plan: null as { id: string; week_start: string } | null,
  entries: [] as { id?: string; planned_date: string; recipe_id: string; position: number; confirmed: boolean; meal_type?: string; is_side_dish?: boolean; parent_entry_id?: string | null; recipes: { title: string } }[],
  alreadyPlannedEntries: [] as { recipe_id: string; planned_date: string }[],
  planByWeekStart: {} as Record<string, { id: string; week_start: string } | null>,
  plansByWeekStart: {} as Record<string, { id: string; week_start: string }[]>,
  entriesByPlanId: {} as Record<string, { recipe_id: string }[]>,
  llmResponse: '{"days":[]}',
  upsertPlanId: 'plan-1',
  planInsertError: null as { message: string } | null,
  entryInsertError: null as { message: string } | null,
  entryById: {} as Record<string, { id: string; planned_date: string; recipe_id: string; meal_plan_id: string; meal_plans: { user_id: string; household_id: string | null } | null } | undefined>,
  rpcError: null as { message: string } | null,
  rpcCallCount: 0,
  // side dishes keyed by parent entry id
  sideDishes: {} as Record<string, { id: string; parentEntryId: string }[]>,
}

// ── Mock chain builder ───────────────────────────────────────────────────────

function mockChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  for (const m of ['from','where','orderBy','limit','offset','innerJoin','leftJoin','set','values','onConflictDoUpdate','onConflictDoNothing','returning','groupBy']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve))
  return chain
}

// ── Module mocks ──────────────────────────────────────────────────────────────

// The db mock is dynamic - it reads mockState at call time
vi.mock('@/lib/db', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic mock factory
  const _db: any = {
    select: vi.fn(() => mockChain()),
    insert: vi.fn(() => mockChain()),
    update: vi.fn(() => mockChain()),
    delete: vi.fn(() => mockChain()),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  }
  return { db: _db }
})

vi.mock('@/lib/auth-server', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => mockState.user ? { user: mockState.user } : null),
    },
  },
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  scopeCondition: vi.fn().mockReturnValue({}),
  scopeInsert: vi.fn((userId: string) => ({ userId })),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
}))

import { resolveHouseholdScope } from '@/lib/household'

vi.mock('@/lib/waste-overlap', () => ({
  detectWasteOverlap: vi.fn().mockResolvedValue(new Map()),
  getPrimaryWasteBadgeText: vi.fn().mockReturnValue(''),
}))

vi.mock('@/lib/taste-profile', () => ({
  deriveTasteProfile: vi.fn().mockResolvedValue({
    loved_recipe_ids:    [],
    disliked_recipe_ids: [],
    top_tags:            [],
    avoided_tags:        [],
    preferred_tags:      [],
    meal_context:        null,
    cooking_frequency:   'moderate',
    recent_recipes:      [],
  }),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: function MockAnthropic(this: any) {
    this.messages = {
      create: async () => ({
        content: [{ type: 'text', text: mockState.llmResponse }],
      }),
      stream: () => { throw new Error('streaming not available in tests') },
    }
  },
}))

vi.mock('@/lib/db/schema', () => ({
  recipes: { id: 'id', userId: 'userId', householdId: 'householdId', title: 'title', tags: 'tags', category: 'category', ingredients: 'ingredients' },
  recipeHistory: { recipeId: 'recipeId', userId: 'userId', madeOn: 'madeOn' },
  mealPlans: { id: 'id', userId: 'userId', weekStart: 'weekStart', householdId: 'householdId' },
  mealPlanEntries: { id: 'id', mealPlanId: 'mealPlanId', recipeId: 'recipeId', plannedDate: 'plannedDate', position: 'position', confirmed: 'confirmed', mealType: 'mealType', isSideDish: 'isSideDish', parentEntryId: 'parentEntryId' },
  userPreferences: { userId: 'userId' },
  pantryItems: { userId: 'userId', name: 'name', expiryDate: 'expiryDate', householdId: 'householdId' },
}))

vi.mock('@/lib/db/helpers', () => ({
  dbFirst: (rows: unknown[]) => rows[0] ?? null,
  dbSingle: (rows: unknown[]) => { if (rows.length === 0) throw new Error('Expected exactly one row, got 0'); return rows[0] },
}))

/* eslint-disable @typescript-eslint/no-explicit-any */
const _MEAL_TYPE_CATEGORIES: Record<string, string[]> = { breakfast: ['breakfast'], lunch: ['main_dish'], dinner: ['main_dish'], snack: ['side_dish'], dessert: ['dessert'] }

vi.mock('@/app/api/plan/helpers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/plan/helpers')>('@/app/api/plan/helpers')
  return {
    ...actual,
    fetchRecipesByMealTypes: vi.fn().mockImplementation(async (_u: any, _c: any, mealTypes: string[]) => {
      const result: Record<string, typeof mockState.recipes> = {}
      for (const mt of mealTypes) result[mt] = mockState.recipes.filter(r => (_MEAL_TYPE_CATEGORIES[mt] ?? []).includes(r.category))
      return result
    }),
    fetchCooldownFilteredRecipes: vi.fn().mockImplementation(async (_u: any, _c: any, cats?: string[]) => mockState.recipes.filter(r => (cats ?? ['main_dish']).includes(r.category))),
    fetchUserPreferences: vi.fn().mockImplementation(async () => mockState.prefs),
    fetchRecentHistory: vi.fn().mockImplementation(async () => mockState.recentHistory),
    fetchPantryContext: vi.fn().mockImplementation(async () => mockState.pantryItems.length ? `Pantry:\n${mockState.pantryItems.map(i => i.name).join(',')}` : ''),
    getOrCreateMealPlan: vi.fn().mockImplementation(async () => {
      if (mockState.planInsertError) return { error: mockState.planInsertError.message }
      if (mockState.plan) return { planId: mockState.plan.id }
      for (const p of Object.values(mockState.planByWeekStart)) { if (p) return { planId: p.id } }
      return { planId: mockState.upsertPlanId }
    }),
  }
})
/* eslint-enable @typescript-eslint/no-explicit-any */

const { POST: suggestPOST } = await import('@/app/api/plan/suggest/route')
const { POST: swapPOST } = await import('@/app/api/plan/suggest/swap/route')
const { POST: matchPOST } = await import('@/app/api/plan/match/route')
const { POST: planPOST, GET: planGET } = await import('@/app/api/plan/route')
const { POST: swapEntriesPOST } = await import('@/app/api/plan/swap/route')

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  const opts: ConstructorParameters<typeof NextRequest>[1] = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) opts!.body = JSON.stringify(body)
  return new NextRequest(url, opts)
}

/* eslint-disable @typescript-eslint/no-explicit-any -- complex mock setup */
function _resolvePlans(): { id: string; weekStart: string }[] {
  if (Object.keys(mockState.plansByWeekStart).length > 0)
    return Object.values(mockState.plansByWeekStart).flat().map(p => ({ id: p.id, weekStart: p.week_start }))
  const all = Object.values(mockState.planByWeekStart).filter(Boolean) as { id: string; week_start: string }[]
  if (all.length > 0) return all.map(p => ({ id: p.id, weekStart: p.week_start }))
  return mockState.plan ? [{ id: mockState.plan.id, weekStart: mockState.plan.week_start }] : []
}
function _resolveEntriesForPlan(planId: string): { recipeId: string }[] {
  if (Object.keys(mockState.entriesByPlanId).length > 0) return (mockState.entriesByPlanId[planId] ?? []).map(e => ({ recipeId: e.recipe_id }))
  return mockState.alreadyPlannedEntries.map(e => ({ recipeId: e.recipe_id }))
}

async function setupDbMocks() {
  const { db } = await import('@/lib/db') as unknown as { db: Record<string, ReturnType<typeof vi.fn>> } // eslint-disable-line @typescript-eslint/no-explicit-any
  let selectCallCount = 0
  db.select!.mockImplementation(() => {
    selectCallCount++
    const n = selectCallCount
    const chain = mockChain([])
    const plans = _resolvePlans()
    chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => {
      if (plans.length > 0) {
        if (n === 1) return Promise.resolve(plans).then(resolve)
        const pi = n - 2
        if (pi >= 0 && pi < plans.length) return Promise.resolve(_resolveEntriesForPlan(plans[pi]!.id)).then(resolve)
        return Promise.resolve([]).then(resolve)
      }
      return Promise.resolve(mockState.recipes).then(resolve)
    })
    return chain
  })

  db.insert!.mockImplementation(() => {
    const chain = mockChain([])
    chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      if (mockState.entryInsertError) {
        const p = Promise.reject(new Error(mockState.entryInsertError.message))
        if (reject) return p.then(resolve, reject)
        return p.catch(() => { throw new Error(mockState.entryInsertError!.message) })
      }
      return Promise.resolve(mockState.entries.map((e, i) => ({
        id: e.id ?? `entry-${i}`, mealPlanId: mockState.upsertPlanId, recipeId: e.recipe_id,
        plannedDate: e.planned_date, position: e.position, confirmed: e.confirmed,
        mealType: e.meal_type ?? 'dinner', isSideDish: e.is_side_dish ?? false, parentEntryId: e.parent_entry_id ?? null,
      }))).then(resolve)
    })
    return chain
  })
  db.delete!.mockImplementation(() => mockChain([]))
  db.update!.mockImplementation(() => { const c = mockChain([]); c.set = vi.fn().mockReturnValue(c); return c })
}

const SWAP_ID_A = '11111111-1111-4111-8111-111111111111'
const SWAP_ID_B = '22222222-2222-4222-8222-222222222222'

async function setupSwapDbMocks() {
  const { db } = await import('@/lib/db') as unknown as { db: Record<string, ReturnType<typeof vi.fn>> }
  // Select call sequence (Promise.all pairs are always called in declaration order in JS):
  //   1 — initial fetch of entry A
  //   2 — initial fetch of entry B
  //   3 — side-dish fetch (inArray on parentEntryId)
  //   4 — re-fetch entry A (after swap)
  //   5 — re-fetch entry B (after swap)
  let selectCallIdx = 0
  db.select!.mockImplementation(() => {
    selectCallIdx++
    const idx = selectCallIdx
    function makeResult() {
      function entryRow(id: string) {
        const entry = mockState.entryById[id]
        if (!entry) return []
        return [{ id: entry.id, plannedDate: entry.planned_date, recipeId: entry.recipe_id,
          mealPlanId: entry.meal_plan_id, planUserId: entry.meal_plans?.user_id ?? null,
          planHouseholdId: entry.meal_plans?.household_id ?? null }]
      }
      if (idx === 1) return entryRow(SWAP_ID_A)
      if (idx === 2) return entryRow(SWAP_ID_B)
      if (idx === 3) {
        // Return side dishes for both parents
        const all = [
          ...(mockState.sideDishes[SWAP_ID_A] ?? []),
          ...(mockState.sideDishes[SWAP_ID_B] ?? []),
        ]
        return all
      }
      // re-fetch after swap: return the (now-updated) planned_date
      function refetchRow(id: string) {
        const entry = mockState.entryById[id]
        if (!entry) return []
        return [{ id: entry.id, plannedDate: entry.planned_date, recipeId: entry.recipe_id }]
      }
      if (idx === 4) return refetchRow(SWAP_ID_A)
      if (idx === 5) return refetchRow(SWAP_ID_B)
      return []
    }
    const chain = mockChain([])
    chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => Promise.resolve(makeResult()).then(resolve))
    return chain
  })
  db.execute!.mockImplementation(async () => {
    mockState.rpcCallCount++
    if (mockState.rpcError) throw new Error(mockState.rpcError.message)
    const a = mockState.entryById[SWAP_ID_A]
    const b = mockState.entryById[SWAP_ID_B]
    if (a && b) { const t = a.planned_date; a.planned_date = b.planned_date; b.planned_date = t }
    return { rows: [] }
  })
  let updateCallCount = 0
  const capturedDates: string[] = []
  db.update!.mockImplementation(() => {
    updateCallCount++
    const cur = updateCallCount
    const chain = mockChain([])
    chain.set = vi.fn().mockImplementation((payload: { plannedDate?: string }) => {
      if (payload.plannedDate) capturedDates.push(payload.plannedDate)
      return chain
    })
    chain.where = vi.fn().mockImplementation(() => {
      if (cur === 1 && capturedDates[0]) { const a = mockState.entryById[SWAP_ID_A]; if (a) a.planned_date = capturedDates[0] }
      if (cur === 2 && capturedDates[1]) { const b = mockState.entryById[SWAP_ID_B]; if (b) b.planned_date = capturedDates[1] }
      return chain
    })
    return chain
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */

beforeEach(async () => {
  // Set up auth session mock
  const { auth } = await import('@/lib/auth-server')
  const mockSession = {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', image: null },
    session: { id: 'sess-1', createdAt: new Date(), updatedAt: new Date(), userId: 'user-1', expiresAt: new Date(Date.now() + 86400000), token: 'tok' },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session type
  vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as any)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockState.user = { id: 'user-1', email: 'test@example.com', name: 'Test', image: null } as any
  mockState.recipes = [
    { id: 'r1', title: 'Pasta',      tags: ['Quick'],   category: 'main_dish' },
    { id: 'r2', title: 'Tacos',      tags: ['Healthy'], category: 'main_dish' },
    { id: 'r3', title: 'Soup',       tags: ['Comfort'], category: 'main_dish' },
    { id: 'r4', title: 'Hummus',     tags: [],          category: 'side_dish' },
    { id: 'r5', title: 'Brownie',    tags: [],          category: 'dessert'   },
  ]
  mockState.recentHistory = []
  mockState.plan = null
  mockState.entries = []
  mockState.alreadyPlannedEntries = []
  mockState.planByWeekStart = {}
  mockState.plansByWeekStart = {}
  mockState.entriesByPlanId = {}
  mockState.planInsertError = null
  mockState.entryInsertError = null
  mockState.entryById = {}
  mockState.rpcError = null
  mockState.rpcCallCount = 0
  mockState.sideDishes = {}
  mockState.llmResponse = JSON.stringify({
    days: [
      {
        date: '2026-03-01',
        meal_types: [
          { meal_type: 'dinner', options: [{ recipe_id: 'r1', recipe_title: 'Pasta', reason: 'Quick' }] },
        ],
      },
    ],
  })

  await setupDbMocks()
})

// ── T08: LLM returns options per day ──────────────────────────────────────────

describe('T08 - POST /api/plan/suggest returns LLM suggestions', () => {
  it('returns suggestions from LLM (non-streaming fallback)', async () => {
    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-03-01',
      active_dates: ['2026-03-01'],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.days).toHaveLength(1)
    expect(body.days[0].meal_types[0].options[0].recipe_id).toBe('r1')
  })
})

// ── T09: recipe_id validation ─────────────────────────────────────────────────

describe('T09 - Invalid recipe_ids are dropped from suggestions', () => {
  it('silently drops options with recipe_ids not in the vault', async () => {
    mockState.llmResponse = JSON.stringify({
      days: [{
        date: '2026-03-01',
        meal_types: [{
          meal_type: 'dinner',
          options: [
            { recipe_id: 'r1', recipe_title: 'Pasta' },
            { recipe_id: 'FAKE-ID', recipe_title: 'Invented Recipe' },
          ],
        }],
      }],
    })
    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-03-01',
      active_dates: ['2026-03-01'],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))
    const body = await res.json()
    expect(body.days[0].meal_types[0].options).toHaveLength(1)
    expect(body.days[0].meal_types[0].options[0].recipe_id).toBe('r1')
  })
})

// ── T10: Cooldown filtering ────────────────────────────────────────────────────

describe('T10 - Cooldown recipes excluded from LLM input', () => {
  it('filters out recipes made within cooldown_days', async () => {
    mockState.prefs.cooldown_days = 28

    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-03-01',
      active_dates: ['2026-03-01'],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))
    expect(res.status).toBe(200)
  })
})

// ── T13: Swap returns only for requested day ──────────────────────────────────

describe('T13 - POST /api/plan/suggest/swap returns new options for one day', () => {
  it('returns options for the specified date only', async () => {
    mockState.llmResponse = JSON.stringify({
      days: [{ date: '2026-03-03', meal_types: [{ meal_type: 'dinner', options: [{ recipe_id: 'r2', recipe_title: 'Tacos' }] }] }],
    })
    const res = await swapPOST(makeReq('POST', 'http://localhost/api/plan/suggest/swap', {
      date: '2026-03-03',
      meal_type: 'dinner',
      week_start: '2026-03-01',
      already_selected: [{ date: '2026-03-01', recipe_id: 'r1' }],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.date).toBe('2026-03-03')
    expect(body.meal_type).toBe('dinner')
    expect(body.options[0].recipe_id).toBe('r2')
  })
})

// ── T21: Free text match ───────────────────────────────────────────────────────

describe('T21 - POST /api/plan/match returns matched recipes', () => {
  it('returns matches array when keyword hits exactly one recipe', async () => {
    mockState.llmResponse = JSON.stringify({ recipe_ids: [] })
    const res = await matchPOST(makeReq('POST', 'http://localhost/api/plan/match', {
      query: 'something with pasta',
      date: '2026-03-01',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.matches).toHaveLength(1)
    expect(body.matches[0].recipe_id).toBe('r1')
    expect(body.matches[0].recipe_title).toBe('Pasta')
  })

  it('returns up to 3 matches when LLM ranks results', async () => {
    mockState.llmResponse = JSON.stringify({ recipe_ids: ['r1', 'r2', 'r3'] })
    const res = await matchPOST(makeReq('POST', 'http://localhost/api/plan/match', {
      query: 'weeknight dinner option',
      date: '2026-03-01',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.matches).toHaveLength(3)
    expect(body.matches[0].recipe_id).toBe('r1')
    expect(body.matches[1].recipe_id).toBe('r2')
    expect(body.matches[2].recipe_id).toBe('r3')
  })
})

// ── T21b: Keyword match bypasses LLM ─────────────────────────────────────────

describe('T21b - keyword match resolves without LLM when recipes match', () => {
  it('returns the keyword-matched recipe even if LLM would return empty', async () => {
    mockState.llmResponse = JSON.stringify({ recipe_ids: [] })
    const res = await matchPOST(makeReq('POST', 'http://localhost/api/plan/match', {
      query: 'something with pasta',
      date: '2026-03-01',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.matches[0].recipe_id).toBe('r1')
  })
})

// ── T22: Free text no match ───────────────────────────────────────────────────

describe('T22 - POST /api/plan/match returns empty array when no match', () => {
  it('returns empty matches array when LLM finds nothing', async () => {
    mockState.llmResponse = JSON.stringify({ recipe_ids: [] })
    const res = await matchPOST(makeReq('POST', 'http://localhost/api/plan/match', {
      query: 'something obscure',
      date: '2026-03-01',
    }))
    const body = await res.json()
    expect(body.matches).toEqual([])
  })
})

// ── T22b: Match route handles fenced LLM responses (regression) ──────────────

describe('T22b - POST /api/plan/match handles fenced JSON from LLM', () => {
  it('returns matches when LLM wraps response in markdown fences', async () => {
    mockState.llmResponse = '```json\n{ "recipe_ids": ["r2"] }\n```'
    const res = await matchPOST(makeReq('POST', 'http://localhost/api/plan/match', {
      query: 'weeknight dinner option',
      date: '2026-03-01',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.matches[0]?.recipe_id).toBe('r2')
    expect(body.matches[0]?.recipe_title).toBe('Tacos')
  })

  it('returns matches when LLM prefixes fenced JSON with prose', async () => {
    mockState.llmResponse = 'Here is the best match:\n```json\n{ "recipe_ids": ["r3"] }\n```'
    const res = await matchPOST(makeReq('POST', 'http://localhost/api/plan/match', {
      query: 'weeknight dinner option',
      date: '2026-03-01',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.matches[0]?.recipe_id).toBe('r3')
    expect(body.matches[0]?.recipe_title).toBe('Soup')
  })
})

// ── T30: Save plan — creates new plan when none exists ────────────────────────

describe('T30 - POST /api/plan creates plan and saves entries via admin client', () => {
  it('creates a new plan and returns plan_id + entries when no existing plan', async () => {
    mockState.plan = null
    mockState.entries = [
      { planned_date: '2026-03-01', recipe_id: 'r1', position: 1, confirmed: true, recipes: { title: 'Pasta' } },
      { planned_date: '2026-03-03', recipe_id: 'r2', position: 1, confirmed: true, recipes: { title: 'Tacos' } },
    ]
    const res = await planPOST(makeReq('POST', 'http://localhost/api/plan', {
      week_start: '2026-03-01',
      entries: [
        { date: '2026-03-01', recipe_id: 'r1' },
        { date: '2026-03-03', recipe_id: 'r2' },
      ],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan_id).toBe('plan-1')
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0].recipe_id).toBe('r1')
    expect(body.entries[1].recipe_id).toBe('r2')
  })

  it('reuses existing plan_id when a plan already exists for the week', async () => {
    mockState.plan = { id: 'existing-plan-99', week_start: '2026-03-01' }
    mockState.entries = [
      { planned_date: '2026-03-01', recipe_id: 'r3', position: 1, confirmed: true, recipes: { title: 'Soup' } },
    ]
    const res = await planPOST(makeReq('POST', 'http://localhost/api/plan', {
      week_start: '2026-03-01',
      entries: [{ date: '2026-03-01', recipe_id: 'r3' }],
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan_id).toBe('existing-plan-99')
    expect(body.entries[0].recipe_id).toBe('r3')
  })

  it('returns 500 with a descriptive message when meal_plan_entries insert fails', async () => {
    mockState.plan = null
    mockState.entryInsertError = { message: 'new row violates row-level security policy for table "meal_plan_entries"' }
    const res = await planPOST(makeReq('POST', 'http://localhost/api/plan', {
      week_start: '2026-03-01',
      entries: [{ date: '2026-03-01', recipe_id: 'r1' }],
    }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/Failed to save entries/)
  })

  it('returns 500 with a descriptive message when meal_plans insert fails', async () => {
    mockState.plan = null
    mockState.planInsertError = { message: 'new row violates row-level security policy for table "meal_plans"' }
    const res = await planPOST(makeReq('POST', 'http://localhost/api/plan', {
      week_start: '2026-03-01',
      entries: [{ date: '2026-03-01', recipe_id: 'r1' }],
    }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/Failed to create plan/)
  })
})

// ── T34: GET /api/plan returns saved plan ─────────────────────────────────────

describe('T34 - GET /api/plan returns saved plan with enriched entries', () => {
  it('returns plan with entries when plan exists', async () => {
    const { db } = await import('@/lib/db')
    let selectCallCount = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        return mockChain([{ id: 'plan-1', weekStart: '2026-03-01' }]) as any // eslint-disable-line @typescript-eslint/no-explicit-any
      }
      return mockChain([{
        id: 'entry-1', plannedDate: '2026-03-01', recipeId: 'r1', position: 1,
        confirmed: true, mealType: 'dinner', isSideDish: false, parentEntryId: null,
        recipeTitle: 'Pasta', totalTimeMinutes: null,
      }]) as any // eslint-disable-line @typescript-eslint/no-explicit-any
    })

    const res = await planGET(makeReq('GET', 'http://localhost/api/plan?week_start=2026-03-01'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan).not.toBeNull()
    expect(body.plan.entries[0].recipe_title).toBe('Pasta')
  })
})

// ── T35: GET /api/plan returns null when no plan ──────────────────────────────

describe('T35 - GET /api/plan returns null plan when none exists', () => {
  it('returns plan=null when no plan for the week', async () => {
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([]) as any)

    const res = await planGET(makeReq('GET', 'http://localhost/api/plan?week_start=2026-03-01'))
    const body = await res.json()
    expect(body.plan).toBeNull()
  })
})

// ── Validation ─────────────────────────────────────────────────────────────────

describe('POST /api/plan/suggest validation', () => {
  it('returns 400 when active_dates is empty', async () => {
    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-03-01',
      active_dates: [],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))
    expect(res.status).toBe(400)
  })

})

describe('POST /api/plan validation', () => {
  it('returns 400 when entries is empty', async () => {
    const res = await planPOST(makeReq('POST', 'http://localhost/api/plan', {
      week_start: '2026-03-01',
      entries: [],
    }))
    expect(res.status).toBe(400)
  })

})

// ── Monday week_start — isSunday guard removed ────────────────────────────────

describe('Monday week_start — plan routes accept Monday start', () => {
  const mondayWeekStart = '2026-03-30'

  it('POST /api/plan accepts a Monday week_start', async () => {
    mockState.recipes = [{ id: 'r1', title: 'Pasta', tags: [], category: 'main_dish' }]
    const res = await planPOST(makeReq('POST', 'http://localhost/api/plan', {
      week_start: mondayWeekStart,
      entries: [{ recipe_id: 'r1', date: mondayWeekStart, meal_type: 'dinner' }],
    }))
    expect(res.status).not.toBe(400)
  })

  it('POST /api/plan/suggest accepts a Monday week_start', async () => {
    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: mondayWeekStart,
      active_dates: [mondayWeekStart],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))
    expect(res.status).not.toBe(400)
  })
})

// ── T30: Snack suggestions come only from side_dish + dessert recipes ──────────

describe('T30 - Snack suggestions use only side_dish recipes', () => {
  it('does not include main_dish or dessert recipes when active_meal_types is [snack]', async () => {
    mockState.llmResponse = JSON.stringify({
      days: [{
        date: '2026-03-01',
        meal_types: [{
          meal_type: 'snack',
          options: [
            { recipe_id: 'r4', recipe_title: 'Hummus' },
            { recipe_id: 'r5', recipe_title: 'Brownie' },
            { recipe_id: 'r1', recipe_title: 'Pasta' },
          ],
        }],
      }],
    })
    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-03-01',
      active_dates: ['2026-03-01'],
      active_meal_types: ['snack'],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const snackOptions = body.days[0].meal_types[0].options
    expect(snackOptions.map((o: { recipe_id: string }) => o.recipe_id)).toEqual(['r4'])
    expect(snackOptions.find((o: { recipe_id: string }) => o.recipe_id === 'r1')).toBeUndefined()
    expect(snackOptions.find((o: { recipe_id: string }) => o.recipe_id === 'r5')).toBeUndefined()
  })
})

// ── T20: Help Me Plan user message includes pantry context block ───────────────

describe('T20 - POST /api/plan/suggest includes pantry context in LLM prompt', () => {
  it('calls LLM with pantry context when pantry has items', async () => {
    mockState.pantryItems = [
      { name: 'chicken breast', expiry_date: '2026-03-30' },
      { name: 'spinach', expiry_date: null },
    ]

    const anthropicMod = await import('@anthropic-ai/sdk')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockAnthropicInstance = (anthropicMod as any).default
    const originalCreate = mockAnthropicInstance.prototype?.messages?.create
    mockState.llmResponse = JSON.stringify({
      days: [{
        date: '2026-03-01',
        meal_types: [{ meal_type: 'dinner', options: [{ recipe_id: 'r1', recipe_title: 'Pasta' }] }],
      }],
    })

    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start:       '2026-03-01',
      active_dates:     ['2026-03-01'],
      prefer_this_week: [],
      avoid_this_week:  [],
      free_text:        '',
    }))

    expect(res.status).toBe(200)
    expect(mockState.pantryItems.length).toBeGreaterThan(0)
    mockState.pantryItems = []
    if (originalCreate) mockAnthropicInstance.prototype.messages.create = originalCreate
  })
})

// ── T21: Pantry context block shown as (none) when pantry is empty ────────────

describe('T21 - Pantry context is (none) when pantry is empty', () => {
  it('succeeds with empty pantry (no error)', async () => {
    mockState.pantryItems = []

    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start:       '2026-03-01',
      active_dates:     ['2026-03-01'],
      prefer_this_week: [],
      avoid_this_week:  [],
      free_text:        '',
    }))

    expect(res.status).toBe(200)
  })
})


// ── T22: Cooldown filtering uses per-user history in household context ─────────

describe('T22 - cooldown filtering uses per-user history, not household-wide', () => {
  it('suggest returns 200 with household ctx: cooldown is per-requesting-user only', async () => {
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'member',
    })
    mockState.prefs.cooldown_days = 28
    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-03-01',
      active_dates: ['2026-03-01'],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.days[0].meal_types[0].options[0].recipe_id).toBe('r1')
  })
})

// ── T31: Already-planned future recipes excluded from suggestions ──────────────

describe('T31 - Already-planned future recipes are excluded from suggestions', () => {
  it('excludes recipe already confirmed for a future date from the candidate pool', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-01' }
    mockState.alreadyPlannedEntries = [
      { recipe_id: 'r1', planned_date: '2026-03-05' },
    ]

    mockState.llmResponse = JSON.stringify({
      days: [{
        date: '2026-03-06',
        meal_types: [{
          meal_type: 'dinner',
          options: [
            { recipe_id: 'r1', recipe_title: 'Pasta' },
            { recipe_id: 'r2', recipe_title: 'Tacos' },
          ],
        }],
      }],
    })

    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-03-01',
      active_dates: ['2026-03-06'],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const options = body.days[0].meal_types[0].options
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r1')).toBeUndefined()
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r2')).toBeDefined()
  })

  it('does not exclude recipes planned for past dates', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-01' }
    mockState.alreadyPlannedEntries = []

    mockState.llmResponse = JSON.stringify({
      days: [{
        date: '2026-03-06',
        meal_types: [{
          meal_type: 'dinner',
          options: [{ recipe_id: 'r1', recipe_title: 'Pasta' }],
        }],
      }],
    })

    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-03-01',
      active_dates: ['2026-03-06'],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const options = body.days[0].meal_types[0].options
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r1')).toBeDefined()
  })

  it('returns available recipes when filtering leaves fewer than options_per_day', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-01' }
    mockState.alreadyPlannedEntries = [
      { recipe_id: 'r1', planned_date: '2026-03-02' },
      { recipe_id: 'r3', planned_date: '2026-03-03' },
    ]
    mockState.prefs.options_per_day = 3

    mockState.llmResponse = JSON.stringify({
      days: [{
        date: '2026-03-06',
        meal_types: [{
          meal_type: 'dinner',
          options: [{ recipe_id: 'r2', recipe_title: 'Tacos' }],
        }],
      }],
    })

    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-03-01',
      active_dates: ['2026-03-06'],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    const options = body.days[0].meal_types[0].options
    expect(options).toHaveLength(1)
    expect(options[0].recipe_id).toBe('r2')
  })
})

// ── T32: Cross-week exclusion — current-week recipes not suggested for next week ─

describe('T32 - Cross-week exclusion: current-week recipes excluded from next-week suggestions', () => {
  it('excludes a recipe already planned in the current week from next-week suggestions', async () => {
    mockState.planByWeekStart = {
      '2026-03-29': { id: 'plan-this', week_start: '2026-03-29' },
      '2026-04-05': null,
    }
    mockState.entriesByPlanId = {
      'plan-this': [{ recipe_id: 'r1' }],
    }

    mockState.llmResponse = JSON.stringify({
      days: [{
        date: '2026-04-07',
        meal_types: [{ meal_type: 'dinner', options: [
          { recipe_id: 'r1', recipe_title: 'Pasta', reason: 'Quick' },
        ]}],
      }],
    })

    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-04-05',
      active_dates: ['2026-04-07'],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    const options = body.days[0].meal_types[0].options
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r1')).toBeUndefined()
  })

  it('does not exclude a recipe when the current week has no active plan', async () => {
    mockState.planByWeekStart = {
      '2026-03-29': null,
      '2026-04-05': null,
    }
    mockState.entriesByPlanId = {}

    mockState.llmResponse = JSON.stringify({
      days: [{
        date: '2026-04-07',
        meal_types: [{ meal_type: 'dinner', options: [
          { recipe_id: 'r2', recipe_title: 'Tacos', reason: 'Healthy' },
        ]}],
      }],
    })

    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-04-05',
      active_dates: ['2026-04-07'],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    const options = body.days[0].meal_types[0].options
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r2')).toBeDefined()
  })

  it('excludes a recipe planned for a past date earlier this week (regression)', async () => {
    mockState.planByWeekStart = {
      '2026-03-29': { id: 'plan-this', week_start: '2026-03-29' },
      '2026-04-05': null,
    }
    mockState.entriesByPlanId = {
      'plan-this': [{ recipe_id: 'r1' }],
    }

    mockState.llmResponse = JSON.stringify({
      days: [{
        date: '2026-04-07',
        meal_types: [{ meal_type: 'dinner', options: [
          { recipe_id: 'r1', recipe_title: 'Pasta', reason: 'Quick' },
        ]}],
      }],
    })

    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-04-05',
      active_dates: ['2026-04-07'],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    const options = body.days[0].meal_types[0].options
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r1')).toBeUndefined()
  })
})

// ── T33: Duplicate meal_plan records — all plans scanned (regression) ──────────

describe('T33 - Duplicate meal_plan records: recipes in any plan record are excluded (regression)', () => {
  it('excludes a recipe found in the second of two plan records for the same week', async () => {
    mockState.plansByWeekStart = {
      '2026-03-29': [
        { id: 'plan-a', week_start: '2026-03-29' },
        { id: 'plan-b', week_start: '2026-03-29' },
      ],
      '2026-04-05': [],
    }
    mockState.entriesByPlanId = {
      'plan-a': [{ recipe_id: 'r1' }],
      'plan-b': [{ recipe_id: 'r2' }],
    }

    mockState.llmResponse = JSON.stringify({
      days: [{
        date: '2026-04-07',
        meal_types: [{ meal_type: 'dinner', options: [
          { recipe_id: 'r1', recipe_title: 'Pasta',  reason: 'Quick'   },
          { recipe_id: 'r2', recipe_title: 'Tacos',  reason: 'Healthy' },
          { recipe_id: 'r3', recipe_title: 'Soup',   reason: 'Warm'    },
        ]}],
      }],
    })

    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-04-05',
      active_dates: ['2026-04-07'],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    const options = body.days[0].meal_types[0].options
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r1')).toBeUndefined()
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r2')).toBeUndefined()
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r3')).toBeDefined()
  })

  it('excludes a recipe in a duplicate plan record for the target week itself', async () => {
    mockState.plansByWeekStart = {
      '2026-03-01': [
        { id: 'plan-a', week_start: '2026-03-01' },
        { id: 'plan-b', week_start: '2026-03-01' },
      ],
    }
    mockState.entriesByPlanId = {
      'plan-a': [],
      'plan-b': [{ recipe_id: 'r1' }],
    }

    mockState.llmResponse = JSON.stringify({
      days: [{
        date: '2026-03-06',
        meal_types: [{ meal_type: 'dinner', options: [
          { recipe_id: 'r1', recipe_title: 'Pasta', reason: 'Quick'   },
          { recipe_id: 'r2', recipe_title: 'Tacos', reason: 'Healthy' },
        ]}],
      }],
    })

    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start: '2026-03-01',
      active_dates: ['2026-03-06'],
      prefer_this_week: [],
      avoid_this_week: [],
      free_text: '',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    const options = body.days[0].meal_types[0].options
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r1')).toBeUndefined()
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r2')).toBeDefined()
  })
})

// ── T34: Intermediate-week cooldown regression ────────────────────────────────

describe('T34 - Intermediate-week cooldown: recipe in a skipped week is excluded from later suggestions', () => {
  it('excludes a recipe planned for an intermediate week from a later week\'s suggestions', async () => {
    mockState.plansByWeekStart = {
      '2026-04-05': [{ id: 'plan-inter', week_start: '2026-04-05' }],
    }
    mockState.entriesByPlanId = {
      'plan-inter': [{ recipe_id: 'r1' }],
    }

    mockState.llmResponse = JSON.stringify({
      days: [{
        date: '2026-04-21',
        meal_types: [{ meal_type: 'dinner', options: [
          { recipe_id: 'r1', recipe_title: 'Pasta',  reason: 'Quick'   },
          { recipe_id: 'r2', recipe_title: 'Tacos',  reason: 'Healthy' },
        ]}],
      }],
    })

    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start:       '2026-04-19',
      active_dates:     ['2026-04-21'],
      prefer_this_week: [],
      avoid_this_week:  [],
      free_text:        '',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    const options = body.days[0].meal_types[0].options
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r1')).toBeUndefined()
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r2')).toBeDefined()
  })
})

// ── T35: Cooldown applies to planned (not just made) recipes (#326) ───────────
// Regression for #326: a recipe in the plan for an earlier week was still
// appearing as a suggestion for a later week even though the gap was less than
// cooldown_days. The root cause: alreadyPlannedIds used `>= today` as the
// cutoff, so entries whose plannedDate was in the past (but within the cooldown
// window) were not fetched and not excluded. Fix: use week_start − cooldownDays
// as the cutoff so the full cooldown lookback is applied.

describe('T35 - Cooldown applies to recently-planned recipes, not just recently-made (#326)', () => {
  it('excludes a recipe planned for the current week from a future week\'s suggestions when within cooldown', async () => {
    mockState.prefs.cooldown_days = 28

    // r1 (Pasta) is in the plan for week of April 5 (current week).
    // User is planning for week of April 20 — only 15 days apart, inside the 28-day cooldown.
    mockState.plansByWeekStart = {
      '2026-04-05': [{ id: 'plan-current', week_start: '2026-04-05' }],
    }
    mockState.entriesByPlanId = {
      'plan-current': [{ recipe_id: 'r1' }],
    }

    mockState.llmResponse = JSON.stringify({
      days: [{
        date: '2026-04-21',
        meal_types: [{ meal_type: 'dinner', options: [
          { recipe_id: 'r1', recipe_title: 'Pasta', reason: 'Quick' },
          { recipe_id: 'r2', recipe_title: 'Tacos', reason: 'Healthy' },
        ]}],
      }],
    })

    const res = await suggestPOST(makeReq('POST', 'http://localhost/api/plan/suggest', {
      week_start:       '2026-04-20',
      active_dates:     ['2026-04-21'],
      prefer_this_week: [],
      avoid_this_week:  [],
      free_text:        '',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    const options = body.days[0].meal_types[0].options
    // r1 must be excluded (15 days < 28-day cooldown)
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r1')).toBeUndefined()
    // r2 is unrelated and must still appear
    expect(options.find((o: { recipe_id: string }) => o.recipe_id === 'r2')).toBeDefined()
  })

})

// ── Swap-entries route tests ──────────────────────────────────────────────────

function makeSwapEntry(id: string, planned_date: string) {
  return {
    id,
    planned_date,
    recipe_id: 'r1',
    meal_plan_id: 'plan-1',
    meal_plans: { user_id: 'user-1', household_id: null },
  }
}

// ── SWAP-T01: 400 when entry_id_a === entry_id_b ─────────────────────────────

describe('SWAP-T01 - 400 when swapping entry with itself', () => {
  it('returns 400 when entry_id_a === entry_id_b', async () => {
    const res = await swapEntriesPOST(makeReq('POST', 'http://localhost/api/plan/swap', {
      entry_id_a: SWAP_ID_A,
      entry_id_b: SWAP_ID_A,
    }))
    expect(res.status).toBe(400)
  })
})

// ── SWAP-T02: 400 on invalid body ────────────────────────────────────────────

describe('SWAP-T02 - 400 on invalid body', () => {
  it('returns 400 when entry_id_a is not a valid UUID', async () => {
    const res = await swapEntriesPOST(makeReq('POST', 'http://localhost/api/plan/swap', {
      entry_id_a: 'not-a-uuid',
      entry_id_b: SWAP_ID_B,
    }))
    expect(res.status).toBe(400)
  })
})

// ── SWAP-T03: 404 when entry_a not found ─────────────────────────────────────

describe('SWAP-T03 - 404 when entry_id_a not found', () => {
  it('returns 404 when entry_a does not exist', async () => {
    mockState.entryById[SWAP_ID_B] = makeSwapEntry(SWAP_ID_B, '2026-03-03')
    await setupSwapDbMocks()

    const res = await swapEntriesPOST(makeReq('POST', 'http://localhost/api/plan/swap', {
      entry_id_a: SWAP_ID_A,
      entry_id_b: SWAP_ID_B,
    }))
    expect(res.status).toBe(404)
  })
})

// ── SWAP-T04: 404 when entry_b not found ─────────────────────────────────────

describe('SWAP-T04 - 404 when entry_id_b not found', () => {
  it('returns 404 when entry_b does not exist', async () => {
    mockState.entryById[SWAP_ID_A] = makeSwapEntry(SWAP_ID_A, '2026-03-01')
    await setupSwapDbMocks()

    const res = await swapEntriesPOST(makeReq('POST', 'http://localhost/api/plan/swap', {
      entry_id_a: SWAP_ID_A,
      entry_id_b: SWAP_ID_B,
    }))
    expect(res.status).toBe(404)
  })
})

// ── SWAP-T05: 403 when entry belongs to different user ───────────────────────

describe('SWAP-T05 - 403 when entry_a belongs to different user', () => {
  it('returns 403 when entry_a.meal_plans.user_id !== requesting user', async () => {
    mockState.entryById[SWAP_ID_A] = {
      ...makeSwapEntry(SWAP_ID_A, '2026-03-01'),
      meal_plans: { user_id: 'other-user', household_id: null },
    }
    mockState.entryById[SWAP_ID_B] = makeSwapEntry(SWAP_ID_B, '2026-03-03')
    await setupSwapDbMocks()

    const res = await swapEntriesPOST(makeReq('POST', 'http://localhost/api/plan/swap', {
      entry_id_a: SWAP_ID_A,
      entry_id_b: SWAP_ID_B,
    }))
    expect(res.status).toBe(403)
  })
})

// ── SWAP-T06: 403 in household mode when entry belongs to different household ─

describe('SWAP-T06 - 403 in household mode when entry belongs to different household', () => {
  it('returns 403 when entry household_id does not match ctx.householdId', async () => {
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'member',
    })
    mockState.entryById[SWAP_ID_A] = {
      ...makeSwapEntry(SWAP_ID_A, '2026-03-01'),
      meal_plans: { user_id: 'user-1', household_id: 'hh-other' },
    }
    mockState.entryById[SWAP_ID_B] = {
      ...makeSwapEntry(SWAP_ID_B, '2026-03-03'),
      meal_plans: { user_id: 'user-1', household_id: 'hh-other' },
    }
    await setupSwapDbMocks()

    const res = await swapEntriesPOST(makeReq('POST', 'http://localhost/api/plan/swap', {
      entry_id_a: SWAP_ID_A,
      entry_id_b: SWAP_ID_B,
    }))
    expect(res.status).toBe(403)
  })
})

// ── SWAP-T07: fallback to direct UPDATEs when RPC unavailable ────────────────

describe('SWAP-T07 - falls back to direct UPDATEs when RPC unavailable', () => {
  it('returns 200 and swaps dates via UPDATE fallback when RPC errors', async () => {
    mockState.entryById[SWAP_ID_A] = makeSwapEntry(SWAP_ID_A, '2026-03-01')
    mockState.entryById[SWAP_ID_B] = makeSwapEntry(SWAP_ID_B, '2026-03-03')
    await setupSwapDbMocks()
    mockState.rpcError = { message: 'function swap_meal_plan_entries does not exist' }

    const res = await swapEntriesPOST(makeReq('POST', 'http://localhost/api/plan/swap', {
      entry_id_a: SWAP_ID_A,
      entry_id_b: SWAP_ID_B,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entry_a.planned_date).toBe('2026-03-03')
    expect(body.entry_b.planned_date).toBe('2026-03-01')
  })
})

// ── SWAP-T08: 200 success, returns swapped entries ───────────────────────────

describe('SWAP-T08 - 200 success returns swapped planned_dates', () => {
  it('returns 200 with entry_a and entry_b having swapped dates', async () => {
    mockState.entryById[SWAP_ID_A] = makeSwapEntry(SWAP_ID_A, '2026-03-01')
    mockState.entryById[SWAP_ID_B] = makeSwapEntry(SWAP_ID_B, '2026-03-03')
    await setupSwapDbMocks()

    const res = await swapEntriesPOST(makeReq('POST', 'http://localhost/api/plan/swap', {
      entry_id_a: SWAP_ID_A,
      entry_id_b: SWAP_ID_B,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entry_a).toBeDefined()
    expect(body.entry_b).toBeDefined()
    expect(body.entry_a.planned_date).toBe('2026-03-03')
    expect(body.entry_b.planned_date).toBe('2026-03-01')
    expect(mockState.rpcCallCount).toBe(1)
  })
})

// ── SWAP-T20: 200 when household member swaps entries in their household ──────

describe('SWAP-T20 - 200 for household member swapping entries in their household', () => {
  it('returns 200 when both entries belong to the requesting household', async () => {
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'member',
    })
    mockState.entryById[SWAP_ID_A] = {
      ...makeSwapEntry(SWAP_ID_A, '2026-03-01'),
      meal_plans: { user_id: 'user-1', household_id: 'hh-1' },
    }
    mockState.entryById[SWAP_ID_B] = {
      ...makeSwapEntry(SWAP_ID_B, '2026-03-03'),
      meal_plans: { user_id: 'user-1', household_id: 'hh-1' },
    }
    await setupSwapDbMocks()

    const res = await swapEntriesPOST(makeReq('POST', 'http://localhost/api/plan/swap', {
      entry_id_a: SWAP_ID_A,
      entry_id_b: SWAP_ID_B,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.entry_a.planned_date).toBe('2026-03-03')
    expect(body.entry_b.planned_date).toBe('2026-03-01')
  })
})

// ── SWAP-T09: side dishes follow their parent when swapping ──────────────────
// Regression for #318: swapping two meals in the calendar caused any side dish
// attached to one of them to disappear because only the two main entries were
// updated, leaving side dishes with their original (now-wrong) planned_date.

const SWAP_SIDE_ID = '33333333-3333-4333-8333-333333333333'

describe('SWAP-T09 - side dish follows its parent entry when swapped (RPC fallback)', () => {
  it('updates the side dish planned_date to match its parent after a swap', async () => {
    mockState.entryById[SWAP_ID_A] = makeSwapEntry(SWAP_ID_A, '2026-03-01')
    mockState.entryById[SWAP_ID_B] = makeSwapEntry(SWAP_ID_B, '2026-03-03')
    // entry A has one side dish
    mockState.sideDishes[SWAP_ID_A] = [{ id: SWAP_SIDE_ID, parentEntryId: SWAP_ID_A }]
    mockState.rpcError = { message: 'function swap_meal_plan_entries does not exist' }

    let sideDishUpdatedDate: string | null = null
    await setupSwapDbMocks()

    // Intercept update calls to capture what date the side dish gets moved to
    const { db } = await import('@/lib/db') as unknown as { db: Record<string, ReturnType<typeof vi.fn>> }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only mock interception
    const origUpdate = db.update!.getMockImplementation() as ((...args: any[]) => any) | undefined
    let updateIdx = 0
    db.update!.mockImplementation((...args: unknown[]) => {
      updateIdx++
      const chain = origUpdate?.(...args) ?? mockChain([])
      // Update 3 is the side dish update for A's children (A=1, B=2, sideA=3)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only mock interception
      const origSet = chain.set as ((...a: any[]) => any) | undefined
      chain.set = vi.fn().mockImplementation((payload: { plannedDate?: string }) => {
        if (updateIdx === 3 && payload.plannedDate) sideDishUpdatedDate = payload.plannedDate
        return origSet?.(payload) ?? chain
      })
      return chain
    })

    const res = await swapEntriesPOST(makeReq('POST', 'http://localhost/api/plan/swap', {
      entry_id_a: SWAP_ID_A,
      entry_id_b: SWAP_ID_B,
    }))
    expect(res.status).toBe(200)
    // The side dish must have been moved to entry B's original date (2026-03-03)
    expect(sideDishUpdatedDate).toBe('2026-03-03')
  })
})
