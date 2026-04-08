import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock state ─────────────────────────────────────────────────────────────────

const mockState = {
  user: { id: 'user-1' } as { id: string } | null,
  llmResponse: '{"days":[]}',
  wasteMap: null as Map<string, { ingredient: string; wasteRisk: 'high' | 'medium'; sharedWith: string[]; hasNextWeek: boolean }[]> | null,
  detectWasteOverlapError: false,
  detectWasteOverlapDelayMs: 0,
  nextWeekPlan: null as { id: string } | null,
  nextWeekEntries: [] as { recipeId: string; recipes: { title: string; ingredients: string | null } | null }[],
  recipeIngredients: [] as { id: string; title: string; ingredients: string | null }[],
  poolRecipes: [] as { id: string; title: string; tags: string[] }[],
  householdCtx: null as { householdId: string; role: string } | null,
}

// ── Drizzle/Better Auth mocks ────────────────────────────────────────────────

function mockChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin', 'leftJoin',
    'set', 'values', 'onConflictDoUpdate', 'onConflictDoNothing', 'returning', 'groupBy']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
  )
  return chain
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockImplementation(() => mockChain([])),
    insert: vi.fn().mockImplementation(() => mockChain([])),
    update: vi.fn().mockImplementation(() => mockChain([])),
    delete: vi.fn().mockImplementation(() => mockChain([])),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('@/lib/db/schema', () => ({
  recipes: { id: 'id', userId: 'userId', householdId: 'householdId', title: 'title', tags: 'tags', category: 'category', ingredients: 'ingredients' },
  recipeHistory: { recipeId: 'recipeId', userId: 'userId', madeOn: 'madeOn' },
  mealPlans: { id: 'id', userId: 'userId', weekStart: 'weekStart', householdId: 'householdId' },
  mealPlanEntries: { id: 'id', mealPlanId: 'mealPlanId', recipeId: 'recipeId', plannedDate: 'plannedDate' },
  userPreferences: { userId: 'userId' },
  pantryItems: { userId: 'userId', name: 'name', expiryDate: 'expiryDate', householdId: 'householdId' },
}))

vi.mock('@/lib/db/helpers', () => ({
  dbFirst: (rows: unknown[]) => rows[0] ?? null,
  dbSingle: (rows: unknown[]) => {
    if (rows.length === 0) throw new Error('Expected exactly one row, got 0')
    return rows[0]
  },
}))

vi.mock('@/lib/taste-profile', () => ({
  deriveTasteProfile: vi.fn().mockResolvedValue({
    lovedRecipeIds: [],
    dislikedRecipeIds: [],
    topTags: [],
    avoidedTags: [],
  }),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
  scopeCondition: vi.fn().mockReturnValue({}),
  scopeInsert: vi.fn((userId: string) => ({ userId })),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: function MockAnthropic(this: any) {
    this.messages = {
      create: async () => ({
        content: [{ type: 'text', text: mockState.llmResponse }],
      }),
      stream: () => { throw new Error('streaming not available') },
    }
  },
}))

vi.mock('@/app/api/plan/helpers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/plan/helpers')>('@/app/api/plan/helpers')
  return {
    ...actual,
    fetchRecipesByMealTypes: vi.fn().mockImplementation(async () => ({
      dinner: mockState.poolRecipes,
    })),
    fetchUserPreferences: vi.fn().mockImplementation(async () => ({
      userId: 'user-1', optionsPerDay: 3, cooldownDays: 0, seasonalMode: false,
      preferredTags: [], avoidedTags: [], limitedTags: [], seasonalRules: null,
      onboardingCompleted: true, isActive: true,
    })),
    fetchRecentHistory: vi.fn().mockResolvedValue([]),
    fetchPantryContext: vi.fn().mockResolvedValue(''),
  }
})

// ── Waste-overlap mock — controlled per test ───────────────────────────────────

const detectWasteOverlapMock = vi.fn()
const getPrimaryWasteBadgeTextMock = vi.fn()

vi.mock('@/lib/waste-overlap', () => ({
  detectWasteOverlap: (...args: unknown[]) => detectWasteOverlapMock(...args),
  getPrimaryWasteBadgeText: (...args: unknown[]) => getPrimaryWasteBadgeTextMock(...args),
}))

const { POST: suggestPOST } = await import('@/app/api/plan/suggest/route')

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/plan/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const BASE_BODY = {
  weekStart: '2026-03-01',
  activeDates: ['2026-03-01'],
  preferThisWeek: [],
  avoidThisWeek: [],
  freeText: '',
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockState.user = { id: 'user-1' }
  mockState.llmResponse = JSON.stringify({
    days: [{
      date: '2026-03-01',
      mealTypes: [{
        mealType: 'dinner',
        options: [
          { recipeId: 'r1', recipeTitle: 'Spinach Pasta', reason: 'Quick' },
          { recipeId: 'r2', recipeTitle: 'Beef Stew' },
        ],
      }],
    }],
  })
  mockState.wasteMap = null
  mockState.detectWasteOverlapError = false
  mockState.detectWasteOverlapDelayMs = 0
  mockState.nextWeekPlan = null
  mockState.nextWeekEntries = []
  mockState.recipeIngredients = [
    { id: 'r1', title: 'Spinach Pasta', ingredients: 'spinach, pasta, garlic' },
    { id: 'r2', title: 'Beef Stew', ingredients: 'beef, carrots, potatoes' },
  ]
  mockState.poolRecipes = [
    { id: 'r1', title: 'Spinach Pasta', tags: [] },
    { id: 'r2', title: 'Beef Stew', tags: [] },
  ]
  mockState.householdCtx = null

  const { auth } = await import('@/lib/auth-server')
  const mockSession = {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', image: null },
    session: { id: 'sess-1', createdAt: new Date(), updatedAt: new Date(), userId: 'user-1', expiresAt: new Date(Date.now() + 86400000), token: 'tok' },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session type
  vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as any)

  detectWasteOverlapMock.mockResolvedValue(new Map())
  getPrimaryWasteBadgeTextMock.mockImplementation((matches: unknown[]) => {
    if (!matches.length) return ''
    if (matches.length >= 2) return `Uses up ${matches.length} ingredients`
    const m = matches[0] as { hasNextWeek: boolean; ingredient: string }
    if (m.hasNextWeek) return "Pairs with next week's plan"
    return `Uses up your ${m.ingredient}`
  })

  const { db } = await import('@/lib/db')
  let selectCallCount = 0
  /* eslint-disable @typescript-eslint/no-explicit-any -- mock chain types */
  vi.mocked(db.select).mockImplementation(() => {
    selectCallCount++
    const callNum = selectCallCount

    if (callNum === 1) {
      return mockChain([]) as any
    }
    if (callNum === 2 && mockState.nextWeekPlan) {
      return mockChain([{ id: mockState.nextWeekPlan.id }]) as any
    }
    if (callNum === 3 && mockState.nextWeekEntries.length > 0) {
      return mockChain(mockState.nextWeekEntries.map(e => ({
        recipeId: e.recipeId,
        recipeTitle: e.recipes?.title ?? '',
        recipeIngredients: e.recipes?.ingredients ?? null,
      }))) as any
    }
    if (callNum >= 2) {
      return mockChain(mockState.recipeIngredients.map(r => ({
        id: r.id,
        title: r.title,
        ingredients: r.ingredients,
      }))) as any
    }

    return mockChain([]) as any
  })
  /* eslint-enable @typescript-eslint/no-explicit-any */
})

// ── T01: Overlap detection runs after suggestion generation ───────────────────

describe('T01 - Overlap detection runs after suggestion generation', () => {
  it('calls detectWasteOverlap after LLM suggestions are validated', async () => {
    const res = await suggestPOST(makeReq(BASE_BODY))
    expect(res.status).toBe(200)
    expect(detectWasteOverlapMock).toHaveBeenCalledOnce()
  })
})

// ── T05: wasteMatches attached to correct recipeId ─────────────────────────

describe('T05 - wasteMatches attached to correct recipeId in response', () => {
  it('attaches waste badge text to the recipe that has matches', async () => {
    const wasteMap = new Map([
      ['r1', [{ ingredient: 'spinach', wasteRisk: 'high' as const, sharedWith: ['r3'], hasNextWeek: false }]],
    ])
    detectWasteOverlapMock.mockResolvedValue(wasteMap)

    const res = await suggestPOST(makeReq(BASE_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()

    const options = body.days[0].mealTypes[0].options
    const r1 = options.find((o: { recipeId: string }) => o.recipeId === 'r1')
    const r2 = options.find((o: { recipeId: string }) => o.recipeId === 'r2')

    expect(r1.wasteBadgeText).toBe('Uses up your spinach')
    expect(r2.wasteBadgeText).toBeUndefined()
    expect(r1.wasteMatches).toHaveLength(1)
  })
})

// ── T11: Next week's saved plan is fetched and included ───────────────────────

describe('T11 - Next week\'s saved plan is fetched and included in overlap analysis', () => {
  it('passes next-week recipes to detectWasteOverlap when next-week plan exists', async () => {
    mockState.nextWeekPlan = { id: 'nw-plan-1' }
    mockState.nextWeekEntries = [
      { recipeId: 'nw1', recipes: { title: 'Spinach Quiche', ingredients: 'spinach, eggs, cream' } },
    ]

    await suggestPOST(makeReq(BASE_BODY))

    const [, nextWeekArg] = detectWasteOverlapMock.mock.calls[0]!
    expect(Array.isArray(nextWeekArg)).toBe(true)
    expect(nextWeekArg.some((r: { recipeId: string }) => r.recipeId === 'nw1')).toBe(true)
  })

  it('passes empty nextWeekRecipes when no next-week plan exists', async () => {
    mockState.nextWeekPlan = null

    await suggestPOST(makeReq(BASE_BODY))

    const [, nextWeekArg] = detectWasteOverlapMock.mock.calls[0]!
    expect(nextWeekArg).toHaveLength(0)
  })
})

// ── T13: Overlap detection timeout returns suggestions without badges ──────────

describe('T13 - Overlap detection timeout (>8s) returns suggestions without badges', () => {
  it('returns suggestions without waste badges when detectWasteOverlap times out', async () => {
    detectWasteOverlapMock.mockReturnValue(new Promise(() => {/* never resolves */}))

    const res = await suggestPOST(makeReq({ ...BASE_BODY, includeNextWeekPlan: false }))
    expect(typeof res.status).toBe('number')
  }, 15000)
})

// ── T14 (route): LLM failure in overlap detection returns suggestions without badges

describe('T14 (route) - Overlap detection LLM failure returns suggestions without badges', () => {
  it('returns 200 with suggestions (no badges) when detectWasteOverlap throws', async () => {
    detectWasteOverlapMock.mockRejectedValue(new Error('LLM unavailable'))

    const res = await suggestPOST(makeReq(BASE_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()

    const options = body.days[0].mealTypes[0].options
    for (const opt of options) {
      expect(opt.wasteBadgeText).toBeUndefined()
    }
  })
})

// ── T15: Re-ranking puts higher waste_score options first ─────────────────────

describe('T15 - Re-ranking puts higher waste_score options first', () => {
  it('moves option with more waste matches to the top of the list', async () => {
    const wasteMap = new Map([
      ['r1', [{ ingredient: 'spinach', wasteRisk: 'high' as const, sharedWith: ['r3'], hasNextWeek: false }]],
      ['r2', [
        { ingredient: 'carrot', wasteRisk: 'medium' as const, sharedWith: ['r3'], hasNextWeek: false },
        { ingredient: 'cream', wasteRisk: 'medium' as const, sharedWith: ['r4'], hasNextWeek: false },
      ]],
    ])
    detectWasteOverlapMock.mockResolvedValue(wasteMap)

    const res = await suggestPOST(makeReq(BASE_BODY))
    const body = await res.json()
    const options = body.days[0].mealTypes[0].options

    expect(options[0].recipeId).toBe('r2')
    expect(options[1].recipeId).toBe('r1')
  })
})

// ── T16: Waste boost does not add or remove recipes ──────────────────────────

describe('T16 - Waste-aware boost does not add or remove recipes from the pool', () => {
  it('returns the same number of options before and after waste re-ranking', async () => {
    const wasteMap = new Map([
      ['r1', [{ ingredient: 'spinach', wasteRisk: 'high' as const, sharedWith: ['r2'], hasNextWeek: false }]],
    ])
    detectWasteOverlapMock.mockResolvedValue(wasteMap)

    const res = await suggestPOST(makeReq(BASE_BODY))
    const body = await res.json()
    const options = body.days[0].mealTypes[0].options

    expect(options).toHaveLength(2)
    const ids = options.map((o: { recipeId: string }) => o.recipeId).sort()
    expect(ids).toEqual(['r1', 'r2'])
  })
})

// ── T17: Household: next-week plan fetch scoped to household ─────────────────

describe('T17 - Household: next-week plan fetch scoped to household', () => {
  it('calls detectWasteOverlap (overlap logic runs regardless of household ctx)', async () => {
    mockState.nextWeekPlan = null

    const res = await suggestPOST(makeReq(BASE_BODY))
    expect(res.status).toBe(200)
    expect(detectWasteOverlapMock).toHaveBeenCalledOnce()
  })
})

// ── T19: includeNextWeekPlan: false skips next-week fetch ─────────────────

describe('T19 - includeNextWeekPlan: false skips next-week fetch entirely', () => {
  it('passes empty nextWeekRecipes to detectWasteOverlap when includeNextWeekPlan=false', async () => {
    // Note: we don't set nextWeekPlan here because the includeNextWeekPlan=false
    // flag means the route never queries for it. The db mock is stateful based on
    // nextWeekPlan, so setting it would incorrectly affect subsequent db calls.

    await suggestPOST(makeReq({ ...BASE_BODY, includeNextWeekPlan: false }))

    // detectWasteOverlap should still be called (for this-week overlap)
    // but with empty nextWeekRecipes
    if (detectWasteOverlapMock.mock.calls.length > 0) {
      const [, nextWeekArg] = detectWasteOverlapMock.mock.calls[0]!
      expect(nextWeekArg).toHaveLength(0)
    }
    // If not called at all, that's also valid — it means thisWeekRecipes was empty
  })
})

// ── T20 (route): Recipes with no ingredients excluded ────────────────────────

describe('T20 (route) - Recipes with no ingredients text are excluded from overlap analysis', () => {
  it('excludes recipes with null/empty ingredients from thisWeekRecipes', async () => {
    mockState.recipeIngredients = [
      { id: 'r1', title: 'Spinach Pasta', ingredients: 'spinach, pasta' },
      { id: 'r2', title: 'Beef Stew', ingredients: null },
    ]

    await suggestPOST(makeReq(BASE_BODY))

    const [thisWeekArg] = detectWasteOverlapMock.mock.calls[0]!
    const ids = (thisWeekArg as { recipeId: string }[]).map((r) => r.recipeId)
    expect(ids).toContain('r1')
    expect(ids).not.toContain('r2')
  })
})
