/**
 * Tests for GET /api/groceries/count
 * Covers spec test cases: T02
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
  mealPlans: { id: 'id', userId: 'userId', weekStart: 'weekStart', householdId: 'householdId' },
  mealPlanEntries: { id: 'id', mealPlanId: 'mealPlanId', recipeId: 'recipeId', plannedDate: 'plannedDate' },
}))

vi.mock('@/lib/db/helpers', () => ({
  dbFirst: (rows: unknown[]) => rows[0] ?? null,
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  canManage: () => true,
  scopeCondition: vi.fn().mockReturnValue({}),
  scopeInsert: vi.fn((userId: string) => ({ userId })),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
}))

async function setupMocks(plans: { id: string }[], entries: { recipeId: string }[]) {
  let selectCallCount = 0
  const { db } = await import('@/lib/db')
  vi.mocked(db.select).mockImplementation(() => {
    selectCallCount++
    if (selectCallCount === 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mockChain(plans) as any
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mockChain(entries) as any
  })
}

function makeReq(dateFrom?: string, dateTo?: string): NextRequest {
  const url = new URL('http://localhost/api/groceries/count')
  if (dateFrom) url.searchParams.set('dateFrom', dateFrom)
  if (dateTo) url.searchParams.set('dateTo', dateTo)
  return new NextRequest(url.toString())
}

describe('T02 — GET /api/groceries/count', () => {
  beforeEach(async () => {
    vi.resetModules()
    const { auth } = await import('@/lib/auth-server')
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com', name: 'Test', image: null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  })

  it('returns 400 when dateFrom is missing', async () => {
    await setupMocks([], [])
    const { GET } = await import('@/app/api/groceries/count/route')
    const res = await GET(makeReq(undefined, '2026-03-22') as Parameters<typeof GET>[0])
    expect(res.status).toBe(400)
  })

  it('returns 400 when dateTo is missing', async () => {
    await setupMocks([], [])
    const { GET } = await import('@/app/api/groceries/count/route')
    const res = await GET(makeReq('2026-03-15') as Parameters<typeof GET>[0])
    expect(res.status).toBe(400)
  })

  it('returns { recipe_count: 0 } when no meal plans exist', async () => {
    await setupMocks([], [])
    const { GET } = await import('@/app/api/groceries/count/route')
    const res = await GET(makeReq('2026-03-15', '2026-03-21') as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.recipe_count).toBe(0)
  })

  it('returns correct distinct recipe count with entries in range', async () => {
    await setupMocks(
      [{ id: 'plan-1' }],
      [
        { recipeId: 'r1' },
        { recipeId: 'r2' },
        { recipeId: 'r1' },
      ],
    )
    const { GET } = await import('@/app/api/groceries/count/route')
    const res = await GET(makeReq('2026-03-15', '2026-03-21') as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.recipe_count).toBe(2)
  })

  it('returns { recipe_count: 0 } when plan has no entries in range', async () => {
    await setupMocks([{ id: 'plan-1' }], [])
    const { GET } = await import('@/app/api/groceries/count/route')
    const res = await GET(makeReq('2026-03-15', '2026-03-21') as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.recipe_count).toBe(0)
  })
})
