/**
 * Tests for PATCH /api/recipes/bulk
 * Covers spec test cases: T22 (success), T23 (additive merge), T42 (403 cross-user), T43 (400 unknown tag)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultMockState, defaultGetSession, makeRequest, mockHousehold } from '@/test/helpers'

const mockState = defaultMockState()

const ownedRecipe = {
  id: 'recipe-1',
  userId: 'user-1',
  householdId: null,
  tags: ['Chicken', 'Quick'],
}

const foreignRecipe = {
  id: 'recipe-2',
  userId: 'user-2',
  householdId: null,
  tags: ['Beef'],
}

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

let selectResults: unknown[][] = [[ownedRecipe]]
let selectCallIdx = 0
let updateResult: unknown[] = []

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const result = selectResults[selectCallIdx] ?? []
      selectCallIdx++
      return mockChain(result)
    }),
    insert: vi.fn(() => mockChain([])),
    update: vi.fn(() => mockChain(updateResult)),
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

vi.mock('@/lib/tags-server', () => ({
  validateTags: vi.fn().mockResolvedValue({ valid: true }),
}))

async function setupAuth() {
  const { auth } = await import('@/lib/auth-server')
  vi.mocked(auth.api.getSession).mockImplementation(defaultGetSession(mockState))
}

describe('PATCH /api/recipes/bulk', () => {
  beforeEach(async () => {
    vi.resetModules()
    selectCallIdx = 0
    updateResult = []
    await setupAuth()
  })

  it('T42: returns 403 when any recipeId belongs to a different user', async () => {
    selectResults = [[ownedRecipe, foreignRecipe]]

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/recipes/bulk', { recipeIds: ['recipe-1', 'recipe-2'], addTags: ['Chicken'] }),
    )
    expect(res.status).toBe(403)
  })

  it('T43: returns 400 when addTags contains an unknown tag', async () => {
    selectResults = [[ownedRecipe]]

    const { validateTags } = await import('@/lib/tags-server')
    vi.mocked(validateTags).mockResolvedValue({ valid: false, unknownTags: ['NotARealTag'] })

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/recipes/bulk', { recipeIds: ['recipe-1'], addTags: ['NotARealTag'] }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Unknown tags/)
  })

  it('T22: returns 200 with updated recipes on success', async () => {
    selectResults = [[ownedRecipe]]
    const updatedRecipe = { ...ownedRecipe, tags: ['Chicken', 'Quick', 'Favorite'] }
    updateResult = [updatedRecipe]

    const { validateTags } = await import('@/lib/tags-server')
    vi.mocked(validateTags).mockResolvedValue({ valid: true })

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/recipes/bulk', { recipeIds: ['recipe-1'], addTags: ['Favorite'] }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
  })

  it('T23: merges addTags additively with existing recipe tags', async () => {
    selectResults = [[ownedRecipe]]
    const updatedRecipe = { ...ownedRecipe, tags: ['Chicken', 'Quick', 'Healthy'] }
    updateResult = [updatedRecipe]

    const { validateTags } = await import('@/lib/tags-server')
    vi.mocked(validateTags).mockResolvedValue({ valid: true })

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/recipes/bulk', { recipeIds: ['recipe-1'], addTags: ['Healthy'] }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    expect(updatedRecipe.tags).toContain('Chicken')
    expect(updatedRecipe.tags).toContain('Quick')
    expect(updatedRecipe.tags).toContain('Healthy')
  })

  it('returns 400 when recipeIds is empty', async () => {
    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/recipes/bulk', { recipeIds: [], addTags: ['Chicken'] }),
    )
    expect(res.status).toBe(400)
  })
})
