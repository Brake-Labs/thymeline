/**
 * Tests for GET /api/recipes/export/json
 * Covers: T09–T13, T15
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultMockState, makeRequest, mockHousehold } from '@/test/helpers'

const mockState = defaultMockState()

const sampleRecipe = {
  id: '00000000-0000-0000-0000-000000000001',
  userId: 'user-1',
  householdId: null,
  title: 'Pasta Carbonara',
  category: 'main_dish',
  ingredients: '200g pasta\n100g pancetta',
  steps: 'Cook pasta\nFry pancetta\nCombine',
  notes: null,
  servings: 4,
  prepTimeMinutes: 10,
  cookTimeMinutes: 20,
  totalTimeMinutes: 30,
  tags: ['Quick'],
  url: 'https://example.com/pasta',
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

const sampleRecipe2 = {
  ...sampleRecipe,
  id: '00000000-0000-0000-0000-000000000002',
  title: 'Simple Salad',
  url: null,
}

// ── Mock chain ──────────────────────────────────────────────────────────────

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

const selectChain = mockChain([])

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => mockChain([])),
    update: vi.fn(() => mockChain([])),
    delete: vi.fn(() => mockChain([])),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('@/lib/household', () => mockHousehold())

// ── Setup ───────────────────────────────────────────────────────────────────

async function setupMocks(opts: {
  user?: typeof mockState.user
  selectResults?: unknown[][]
} = {}) {
  /* eslint-disable @typescript-eslint/no-explicit-any -- mock types */
  const { auth } = await import('@/lib/auth-server')
  vi.mocked(auth.api.getSession).mockImplementation((async () => {
    const u = opts.user !== undefined ? opts.user : mockState.user
    if (!u) return null
    return {
      user: u,
      session: { id: 'sess-1', createdAt: new Date(), updatedAt: new Date(), userId: u.id, expiresAt: new Date(Date.now() + 86400000), token: 'tok' },
    }
  }) as any)

  const selectResults = opts.selectResults ?? [[]]
  let selectCallIdx = 0
  const { db } = await import('@/lib/db')
  vi.mocked(db.select).mockImplementation(() => {
    const result = selectResults[selectCallIdx] ?? []
    selectCallIdx++
    return mockChain(result) as any
  })

  const { resolveHouseholdScope } = await import('@/lib/household')
  vi.mocked(resolveHouseholdScope).mockResolvedValue(null)
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/recipes/export/json', () => {
  beforeEach(() => { vi.resetModules() })

  it('T09: no ids param returns all user recipes', async () => {
    await setupMocks({ selectResults: [[sampleRecipe, sampleRecipe2]] })
    const { GET } = await import('../json/route')
    const req = makeRequest('GET', 'http://localhost/api/recipes/export/json')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.recipe_count).toBe(2)
    expect(json.recipes).toHaveLength(2)
  })

  it('T10: ids param filters correctly', async () => {
    await setupMocks({ selectResults: [[sampleRecipe]] })
    const { GET } = await import('../json/route')
    const req = makeRequest('GET', `http://localhost/api/recipes/export/json?ids=${sampleRecipe.id}`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.recipe_count).toBe(1)
    expect(json.recipes[0].id).toBe(sampleRecipe.id)
  })

  it('T11: inaccessible ID returns 403', async () => {
    // Request 1 ID but DB returns empty (not in scope)
    await setupMocks({ selectResults: [[]] })
    const { GET } = await import('../json/route')
    const req = makeRequest('GET', `http://localhost/api/recipes/export/json?ids=${sampleRecipe.id}`)
    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it('T12: response includes all required fields', async () => {
    await setupMocks({ selectResults: [[sampleRecipe]] })
    const { GET } = await import('../json/route')
    const req = makeRequest('GET', 'http://localhost/api/recipes/export/json')
    const res = await GET(req)
    const json = await res.json()

    expect(json).toHaveProperty('exported_at')
    expect(json).toHaveProperty('recipe_count')
    expect(json.recipes[0]).toHaveProperty('id')
    expect(json.recipes[0]).toHaveProperty('title')
    expect(json.recipes[0]).toHaveProperty('category')
    expect(json.recipes[0]).toHaveProperty('ingredients')
    expect(json.recipes[0]).toHaveProperty('steps')
    expect(json.recipes[0]).toHaveProperty('notes')
    expect(json.recipes[0]).toHaveProperty('servings')
    expect(json.recipes[0]).toHaveProperty('prep_time_minutes')
    expect(json.recipes[0]).toHaveProperty('cook_time_minutes')
    expect(json.recipes[0]).toHaveProperty('total_time_minutes')
    expect(json.recipes[0]).toHaveProperty('tags')
    expect(json.recipes[0]).toHaveProperty('source_url')
    expect(json.recipes[0]).toHaveProperty('created_at')
  })

  it('T13: Content-Disposition filename includes date', async () => {
    await setupMocks({ selectResults: [[sampleRecipe]] })
    const { GET } = await import('../json/route')
    const req = makeRequest('GET', 'http://localhost/api/recipes/export/json')
    const res = await GET(req)
    const cd = res.headers.get('Content-Disposition') ?? ''
    const dateStr = new Date().toISOString().slice(0, 10)
    expect(cd).toContain(`thymeline-recipes-${dateStr}.json`)
  })

  it('T15: household member can export recipes they have access to', async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- mock types */
    const { resolveHouseholdScope } = await import('@/lib/household')
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'member',
    } as any)
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const hhRecipe = { ...sampleRecipe, householdId: 'hh-1', userId: 'user-2' }
    await setupMocks({ selectResults: [[hhRecipe]] })

    const { GET } = await import('../json/route')
    const req = makeRequest('GET', 'http://localhost/api/recipes/export/json')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.recipe_count).toBe(1)
  })

  it('returns 400 for invalid UUID in ids param', async () => {
    await setupMocks()
    const { GET } = await import('../json/route')
    const req = makeRequest('GET', 'http://localhost/api/recipes/export/json?ids=not-a-uuid')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })
})
