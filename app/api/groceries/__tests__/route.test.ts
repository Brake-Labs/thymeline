/**
 * Regression tests for GET /api/groceries and PATCH /api/groceries
 * Verifies that responses use camelCase field names matching GroceryList type.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

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

// A mock grocery list row as Drizzle returns it (camelCase)
const mockDrizzleRow = {
  id:           'list-1',
  userId:       'user-1',
  householdId:  null,
  mealPlanId:   'plan-1',
  weekStart:    '2026-04-07',
  dateFrom:     '2026-04-07',
  dateTo:       '2026-04-13',
  servings:     4,
  recipeScales: [{ recipeId: 'r1', recipeTitle: 'Pasta', servings: 4 }],
  items:        [{ id: 'i1', name: 'Pasta', amount: 200, unit: 'g', section: 'Pantry', isPantry: false, checked: false, recipes: ['Pasta'] }],
  createdAt:    new Date('2026-04-07T00:00:00Z'),
  updatedAt:    new Date('2026-04-07T00:00:00Z'),
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('@/lib/db/schema', () => ({
  groceryLists: {
    id: 'id', userId: 'userId', householdId: 'householdId',
    mealPlanId: 'mealPlanId', weekStart: 'weekStart',
    dateFrom: 'dateFrom', dateTo: 'dateTo', servings: 'servings',
    recipeScales: 'recipeScales', items: 'items',
    createdAt: 'createdAt', updatedAt: 'updatedAt',
  },
  mealPlans: { id: 'id', userId: 'userId', weekStart: 'weekStart', householdId: 'householdId', servings: 'servings' },
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
  canManage: () => true,
  scopeCondition: vi.fn().mockReturnValue({}),
  scopeInsert: vi.fn((userId: string) => ({ userId })),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
}))

vi.mock('@/lib/schemas', () => ({
  updateGroceryListSchema: {},
  parseBody: vi.fn().mockResolvedValue({
    data: { weekStart: '2026-04-07', items: [] },
    error: null,
  }),
}))

function makeGetReq(dateFrom?: string): NextRequest {
  const url = new URL('http://localhost/api/groceries')
  if (dateFrom) url.searchParams.set('dateFrom', dateFrom)
  return new NextRequest(url.toString())
}

describe('GET /api/groceries — camelCase response shape', () => {
  beforeEach(async () => {
    vi.resetModules()
    const { auth } = await import('@/lib/auth-server')
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com', name: 'Test', image: null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  })

  it('returns 400 when dateFrom is missing', async () => {
    const { GET } = await import('@/app/api/groceries/route')
    const res = await GET(makeGetReq() as Parameters<typeof GET>[0])
    expect(res.status).toBe(400)
  })

  it('returns { list: null } when no list exists', async () => {
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([]) as any)

    const { GET } = await import('@/app/api/groceries/route')
    const res = await GET(makeGetReq('2026-04-07') as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.list).toBeNull()
  })

  it('returns camelCase fields matching Drizzle output directly', async () => {
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([mockDrizzleRow]) as any)

    const { GET } = await import('@/app/api/groceries/route')
    const res = await GET(makeGetReq('2026-04-07') as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    const list = json.list

    // camelCase keys from Drizzle pass through directly
    expect(list.weekStart).toBe('2026-04-07')
    expect(list.mealPlanId).toBe('plan-1')
    expect(list.userId).toBe('user-1')
    expect(list.recipeScales).toBeDefined()
    expect(list.createdAt).toBeDefined()
    expect(list.updatedAt).toBeDefined()
    expect(list.dateFrom).toBe('2026-04-07')
    expect(list.dateTo).toBe('2026-04-13')
    expect(list.servings).toBe(4)

    // No snake_case keys
    expect(list.week_start).toBeUndefined()
    expect(list.meal_plan_id).toBeUndefined()
    expect(list.user_id).toBeUndefined()
    expect(list.recipe_scales).toBeUndefined()
  })
})

describe('GET /api/groceries — backward-compat: snake_case JSONB normalization (regression #358)', () => {
  beforeEach(async () => {
    vi.resetModules()
    const { auth } = await import('@/lib/auth-server')
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com', name: 'Test' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  })

  it('normalizes snake_case recipeScales JSONB keys to camelCase', async () => {
    const { db } = await import('@/lib/db')
    // Simulate a row stored before the camelCase refactor (#351)
    const oldFormatRow = {
      id:           'list-1',
      userId:       'user-1',
      householdId:  null,
      mealPlanId:   'plan-1',
      weekStart:    '2025-10-01',
      dateFrom:     '2025-10-01',
      dateTo:       '2025-10-07',
      servings:     4,
      recipeScales: [{ recipe_id: 'r1', recipe_title: 'Pasta', servings: 4 }],
      items:        [{ id: 'i1', name: 'Pasta', amount: 200, unit: 'g', section: 'Pantry', is_pantry: false, checked: false, recipes: ['Pasta'] }],
      createdAt:    new Date('2025-10-01T00:00:00Z'),
      updatedAt:    new Date('2025-10-01T00:00:00Z'),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([oldFormatRow]) as any)

    const { GET } = await import('@/app/api/groceries/route')
    const res = await GET(makeGetReq('2025-10-01') as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    const list = json.list

    // recipeScales must have camelCase keys
    expect(list.recipeScales[0].recipeId).toBe('r1')
    expect(list.recipeScales[0].recipeTitle).toBe('Pasta')
    expect(list.recipeScales[0].recipe_id).toBeUndefined()
    expect(list.recipeScales[0].recipe_title).toBeUndefined()

    // items must have camelCase isPantry
    expect(list.items[0].isPantry).toBe(false)
    expect(list.items[0].is_pantry).toBeUndefined()
  })

  it('passes through already-normalized camelCase JSONB unchanged', async () => {
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([{
      id:           'list-2',
      userId:       'user-1',
      householdId:  null,
      mealPlanId:   'plan-2',
      weekStart:    '2026-04-07',
      dateFrom:     '2026-04-07',
      dateTo:       '2026-04-13',
      servings:     4,
      recipeScales: [{ recipeId: 'r2', recipeTitle: 'Salad', servings: null }],
      items:        [{ id: 'i2', name: 'Lettuce', amount: 1, unit: 'head', section: 'Produce', isPantry: false, checked: false, recipes: ['Salad'] }],
      createdAt:    new Date('2026-04-07T00:00:00Z'),
      updatedAt:    new Date('2026-04-07T00:00:00Z'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }]) as any)

    const { GET } = await import('@/app/api/groceries/route')
    const res = await GET(makeGetReq('2026-04-07') as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.list.recipeScales[0].recipeId).toBe('r2')
    expect(json.list.recipeScales[0].recipeTitle).toBe('Salad')
    expect(json.list.items[0].isPantry).toBe(false)
  })
})
