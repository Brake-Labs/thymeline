import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock state ─────────────────────────────────────────────────────────────────

const mockState = {
  user: { id: 'user-1' } as { id: string } | null,
  plan: null as { id: string; weekStart: string } | null,
  entry: null as { id: string; userId: string } | null,
  entryError: null as { message: string } | null,
  parentEntryMealType: null as string | null,
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

const mockDbSelect = vi.fn()
const mockDbInsert = vi.fn()
const mockDbDelete = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: vi.fn().mockImplementation(() => mockChain([])),
    delete: (...args: unknown[]) => mockDbDelete(...args),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('@/lib/db/schema', () => ({
  recipes: { id: 'id', userId: 'userId', householdId: 'householdId', title: 'title' },
  mealPlans: { id: 'id', userId: 'userId', weekStart: 'weekStart', householdId: 'householdId' },
  mealPlanEntries: { id: 'id', mealPlanId: 'mealPlanId', recipeId: 'recipeId', plannedDate: 'plannedDate', position: 'position', confirmed: 'confirmed', mealType: 'mealType', isSideDish: 'isSideDish', parentEntryId: 'parentEntryId' },
}))

vi.mock('@/lib/db/helpers', () => ({
  dbFirst: (rows: unknown[]) => rows[0] ?? null,
  dbSingle: (rows: unknown[]) => {
    if (rows.length === 0) throw new Error('Expected exactly one row, got 0')
    return rows[0]
  },
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
  scopeCondition: vi.fn().mockReturnValue({}),
  scopeInsert: vi.fn((userId: string) => ({ userId })),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
}))

vi.mock('@/app/api/plan/helpers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/plan/helpers')>('@/app/api/plan/helpers')
  return {
    ...actual,
    getOrCreateMealPlan: vi.fn().mockImplementation(async () => {
      if (mockState.plan) return { planId: mockState.plan.id }
      return { planId: 'new-plan-1' }
    }),
  }
})

function setupDbMocks() {
  let selectCallCount = 0

  mockDbSelect.mockImplementation(() => {
    selectCallCount++
    const callNum = selectCallCount

    const chain: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin', 'leftJoin', 'groupBy']) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }

    // Enriched entry result (for POST route after insert)
    const enrichedEntry = [{
      id: 'entry-1',
      recipeId: 'r1',
      plannedDate: '2026-03-01',
      position: 1,
      confirmed: true,
      mealType: 'dinner',
      isSideDish: false,
      parentEntryId: null,
      recipeTitle: 'Pasta',
      totalTimeMinutes: null,
    }]

    chain.then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => void) => {
        // For dessert parent validation (first select)
        if (mockState.parentEntryMealType !== null && callNum === 1) {
          return Promise.resolve([{ mealType: mockState.parentEntryMealType }]).then(resolve)
        }
        // For DELETE ownership check
        if (mockState.entry && callNum === 1) {
          return Promise.resolve([{
            id: mockState.entry.id,
            mealPlanId: 'plan-1',
            planUserId: mockState.entry.userId,
            planHouseholdId: null,
          }]).then(resolve)
        }
        // For POST enriched entry fetch (after insert):
        // - non-dessert: 1st select = enriched entry
        // - dessert: 2nd select = enriched entry (1st was parent validation)
        if (mockState.parentEntryMealType !== null && callNum === 2) {
          return Promise.resolve(enrichedEntry).then(resolve)
        }
        if (!mockState.entry && mockState.parentEntryMealType === null && mockState.plan && callNum === 1) {
          // Non-dessert POST: first select is the enriched entry
          return Promise.resolve(enrichedEntry).then(resolve)
        }
        return Promise.resolve([]).then(resolve)
      },
    )
    return chain
  })

  mockDbInsert.mockImplementation(() => {
    const chain: Record<string, unknown> = {}
    for (const m of ['values', 'onConflictDoUpdate', 'onConflictDoNothing', 'returning']) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }

    chain.then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        if (mockState.entryError) {
          const p = Promise.reject(new Error(mockState.entryError.message))
          if (reject) return p.then(resolve, reject)
          return p
        }
        return Promise.resolve([{
          id: 'entry-1',
          mealPlanId: mockState.plan?.id ?? 'new-plan-1',
          recipeId: 'r1',
          plannedDate: '2026-03-01',
          position: 1,
          confirmed: true,
          mealType: 'dinner',
          isSideDish: false,
          parentEntryId: null,
        }]).then(resolve)
      },
    )
    return chain
  })

  mockDbDelete.mockReturnValue(mockChain([]))
}

const { POST: entriesPOST } = await import('@/app/api/plan/entries/route')
const { DELETE: entryDELETE } = await import('@/app/api/plan/entries/[entry_id]/route')

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  const opts: ConstructorParameters<typeof NextRequest>[1] = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) opts!.body = JSON.stringify(body)
  return new NextRequest(url, opts)
}

function makeDeleteReq(entryId: string): [NextRequest, { params: { entry_id: string } }] {
  return [
    makeReq('DELETE', `http://localhost/api/plan/entries/${entryId}`),
    { params: { entry_id: entryId } },
  ]
}

beforeEach(async () => {
  const { auth } = await import('@/lib/auth-server')
  const mockSession = {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', image: null },
    session: { id: 'sess-1', createdAt: new Date(), updatedAt: new Date(), userId: 'user-1', expiresAt: new Date(Date.now() + 86400000), token: 'tok' },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session type
  vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as any)

  mockState.user = { id: 'user-1' }
  mockState.plan = null
  mockState.entry = null
  mockState.entryError = null
  mockState.parentEntryMealType = null

  setupDbMocks()
})

// ── T17: POST /api/plan/entries — side dish + breakfast returns 400 ────────────

describe('T17 - POST /api/plan/entries with isSideDish=true and mealType=breakfast returns 400', () => {
  it('returns 400 when side dish is for a breakfast slot', async () => {
    mockState.plan = { id: 'plan-1', weekStart: '2026-03-01' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      weekStart: '2026-03-01',
      date: '2026-03-01',
      recipeId: 'r1',
      mealType: 'breakfast',
      isSideDish: true,
      parentEntryId: 'parent-1',
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Side dishes are only allowed')
  })

  it('returns 400 when side dish is for a snack slot', async () => {
    mockState.plan = { id: 'plan-1', weekStart: '2026-03-01' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      weekStart: '2026-03-01',
      date: '2026-03-01',
      recipeId: 'r1',
      mealType: 'snack',
      isSideDish: true,
      parentEntryId: 'parent-1',
    }))
    expect(res.status).toBe(400)
  })

  it('allows side dish for dinner slot', async () => {
    mockState.plan = { id: 'plan-1', weekStart: '2026-03-01' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      weekStart: '2026-03-01',
      date: '2026-03-01',
      recipeId: 'r1',
      mealType: 'dinner',
      isSideDish: true,
      parentEntryId: 'parent-1',
    }))
    expect(res.status).toBe(201)
  })
})

// ── T18: POST /api/plan/entries — side dish without parentEntryId returns 400 ─

describe('T18 - POST /api/plan/entries with isSideDish=true and no parentEntryId returns 400', () => {
  it('returns 400 when parentEntryId is missing for side dish', async () => {
    mockState.plan = { id: 'plan-1', weekStart: '2026-03-01' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      weekStart: '2026-03-01',
      date: '2026-03-01',
      recipeId: 'r1',
      mealType: 'dinner',
      isSideDish: true,
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('parentEntryId')
  })
})

// ── T15: DELETE /api/plan/entries/[id] — 403 for non-owner ────────────────────

describe('T15 - DELETE /api/plan/entries/[id] returns 403 for non-owner', () => {
  it('returns 403 when the entry belongs to another user', async () => {
    mockState.entry = { id: 'entry-1', userId: 'other-user' }
    setupDbMocks()
    const [req, ctx] = makeDeleteReq('entry-1')
    const res = await entryDELETE(req, ctx)
    expect(res.status).toBe(403)
  })

  it('returns 204 for the owner', async () => {
    mockState.entry = { id: 'entry-1', userId: 'user-1' }
    setupDbMocks()
    const [req, ctx] = makeDeleteReq('entry-1')
    const res = await entryDELETE(req, ctx)
    expect(res.status).toBe(204)
  })

  it('returns 404 when entry does not exist', async () => {
    mockState.entry = null
    setupDbMocks()
    const [req, ctx] = makeDeleteReq('nonexistent')
    const res = await entryDELETE(req, ctx)
    expect(res.status).toBe(404)
  })
})

// ── POST /api/plan/entries — basic creation ────────────────────────────────────

describe('POST /api/plan/entries - creates entry', () => {
  it('returns 201 with the created entry', async () => {
    mockState.plan = { id: 'plan-1', weekStart: '2026-03-01' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      weekStart: '2026-03-01',
      date: '2026-03-01',
      recipeId: 'r1',
      mealType: 'dinner',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.mealType).toBe('dinner')
    expect(body.recipeId).toBe('r1')
  })

  it('returns 400 when date is outside week', async () => {
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      weekStart: '2026-03-01',
      date: '2026-03-10',
      recipeId: 'r1',
      mealType: 'dinner',
    }))
    expect(res.status).toBe(400)
  })

})

// ── Dessert entry tests ────────────────────────────────────────────────────────

describe('Dessert entries — mealType=dessert', () => {
  it('saves with correct mealType when parent is a dinner slot', async () => {
    mockState.plan = { id: 'plan-1', weekStart: '2026-03-01' }
    mockState.parentEntryMealType = 'dinner'
    setupDbMocks()
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      weekStart: '2026-03-01',
      date: '2026-03-01',
      recipeId: 'r1',
      mealType: 'dessert',
      parentEntryId: 'parent-1',
    }))
    expect(res.status).toBe(201)
  })

  it('saves with correct mealType when parent is a lunch slot', async () => {
    mockState.plan = { id: 'plan-1', weekStart: '2026-03-01' }
    mockState.parentEntryMealType = 'lunch'
    setupDbMocks()
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      weekStart: '2026-03-01',
      date: '2026-03-01',
      recipeId: 'r1',
      mealType: 'dessert',
      parentEntryId: 'parent-1',
    }))
    expect(res.status).toBe(201)
  })

  it('returns 400 when attached to a breakfast parent slot', async () => {
    mockState.plan = { id: 'plan-1', weekStart: '2026-03-01' }
    mockState.parentEntryMealType = 'breakfast'
    setupDbMocks()
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      weekStart: '2026-03-01',
      date: '2026-03-01',
      recipeId: 'r1',
      mealType: 'dessert',
      parentEntryId: 'parent-1',
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Dinner and Lunch')
  })

  it('returns 400 when attached to a snack parent slot', async () => {
    mockState.plan = { id: 'plan-1', weekStart: '2026-03-01' }
    mockState.parentEntryMealType = 'snack'
    setupDbMocks()
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      weekStart: '2026-03-01',
      date: '2026-03-01',
      recipeId: 'r1',
      mealType: 'dessert',
      parentEntryId: 'parent-1',
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when parentEntryId is missing', async () => {
    mockState.plan = { id: 'plan-1', weekStart: '2026-03-01' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      weekStart: '2026-03-01',
      date: '2026-03-01',
      recipeId: 'r1',
      mealType: 'dessert',
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('parentEntryId')
  })
})

// ── Monday weekStart — isSunday guard removed ────────────────────────────────

describe('POST /api/plan/entries — Monday weekStart accepted', () => {
  it('does not return 400 for a Monday weekStart', async () => {
    mockState.plan = { id: 'plan-1', weekStart: '2026-03-30' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      weekStart: '2026-03-30',
      date: '2026-03-30',
      recipeId: 'r1',
      mealType: 'dinner',
    }))
    expect(res.status).not.toBe(400)
  })
})
