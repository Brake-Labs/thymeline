/**
 * Tests for /api/recipes and /api/recipes/[id] routes.
 * Covers spec test cases: T03, T04, T08, T09, T10, T11, T12, T13, T14, T15, T16
 *
 * These are unit tests with mocked Drizzle/Better Auth — they validate route
 * logic without a real database connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultMockState, makeRequest, mockHousehold } from '@/test/helpers'

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockState = defaultMockState()

const sampleRecipe = {
  id: 'recipe-1',
  userId: 'user-1',
  householdId: null,
  title: 'Pasta Carbonara',
  category: 'main_dish',
  tags: ['Favorite', 'Quick'],
  isShared: false,
  ingredients: '200g pasta\n100g pancetta',
  steps: 'Cook pasta\nFry pancetta\nCombine',
  notes: null,
  url: null,
  imageUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
  source: 'manual',
  prepTimeMinutes: null,
  cookTimeMinutes: null,
  totalTimeMinutes: null,
  inactiveTimeMinutes: null,
  servings: null,
}

const sharedRecipe = {
  ...sampleRecipe,
  id: 'recipe-shared',
  userId: 'user-2',
  isShared: true,
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

// ── Mock state for DB queries ────────────────────────────────────────────────

let selectChain = mockChain([])
let insertChain = mockChain([])
let updateChain = mockChain([])
const deleteChain = mockChain([])

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    delete: vi.fn(() => deleteChain),
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

// ── Helper to setup auth and db mocks per test ────────────────────────────────

async function setupMocks(opts: {
  user?: typeof mockState.user
  selectResults?: unknown[][]
  insertResult?: unknown[]
  updateResult?: unknown[]
} = {}) {
  /* eslint-disable @typescript-eslint/no-explicit-any -- mock chain/session types */
  const { auth } = await import('@/lib/auth-server')
  vi.mocked(auth.api.getSession).mockImplementation((async () => {
      const u = opts.user !== undefined ? opts.user : mockState.user
      if (!u) return null
      return {
        user: u,
        session: { id: 'sess-1', createdAt: new Date(), updatedAt: new Date(), userId: u.id, expiresAt: new Date(Date.now() + 86400000), token: 'tok' },
      }
    }) as any
  )

  // Reset chains
  const selectResults = opts.selectResults ?? [[]]
  let selectCallIdx = 0
  selectChain = mockChain(selectResults[0] ?? [])

  const { db } = await import('@/lib/db')
  vi.mocked(db.select).mockImplementation(() => {
    const result = selectResults[selectCallIdx] ?? []
    selectCallIdx++
    return mockChain(result) as any
  })

  if (opts.insertResult) {
    insertChain = mockChain(opts.insertResult)
    vi.mocked(db.insert).mockReturnValue(mockChain(opts.insertResult) as any)
  }

  if (opts.updateResult) {
    updateChain = mockChain(opts.updateResult)
    vi.mocked(db.update).mockReturnValue(mockChain(opts.updateResult) as any)
  }

  vi.mocked(db.delete).mockReturnValue(mockChain([]) as any)
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Reset validateTags to default (valid) state
  const { validateTags } = await import('@/lib/tags-server')
  vi.mocked(validateTags).mockResolvedValue({ valid: true })

  // Reset household mocks to defaults
  const { resolveHouseholdScope, checkOwnership } = await import('@/lib/household')
  vi.mocked(resolveHouseholdScope).mockResolvedValue(null)
  vi.mocked(checkOwnership).mockResolvedValue({ owned: true })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/recipes — T03: manual add with no URL', () => {
  beforeEach(() => { vi.resetModules() })

  it('creates a recipe with all optional fields empty', async () => {
    const created = { ...sampleRecipe, url: null, ingredients: null, steps: null }
    await setupMocks({ insertResult: [created] })

    const { POST } = await import('../route')
    const req = makeRequest('POST', 'http://localhost/api/recipes', {
      title: 'Pasta Carbonara',
      category: 'main_dish',
      tags: [],
    })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.title).toBe('Pasta Carbonara')
  })
})

describe('GET /api/recipes — T04: new recipe appears in table with correct fields', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns recipe list with last_made = null for a new recipe', async () => {
    await setupMocks({
      selectResults: [
        [sampleRecipe],  // recipes query
        [],              // history query
      ],
    })

    const { GET } = await import('../route')
    const req = makeRequest('GET', 'http://localhost/api/recipes')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveLength(1)
    expect(json[0].title).toBe('Pasta Carbonara')
    expect(json[0].category).toBe('main_dish')
    expect(json[0].last_made).toBeNull()
    expect(json[0].times_made).toBe(0)
  })
})

describe('GET /api/recipes — T15: tag filter', () => {
  beforeEach(() => { vi.resetModules() })

  it('passes tag filter to query', async () => {
    await setupMocks({
      selectResults: [
        [sampleRecipe],  // recipes query
        [],              // history query
      ],
    })

    const { GET } = await import('../route')
    const req = makeRequest('GET', 'http://localhost/api/recipes?tag=Favorite')
    const res = await GET(req)

    expect(res.status).toBe(200)
  })
})

describe('GET /api/recipes — T16: category filter', () => {
  beforeEach(() => { vi.resetModules() })

  it('passes category filter to query', async () => {
    await setupMocks({
      selectResults: [
        [sampleRecipe],  // recipes query
        [],              // history query
      ],
    })

    const { GET } = await import('../route')
    const req = makeRequest('GET', 'http://localhost/api/recipes?category=main_dish')
    const res = await GET(req)

    expect(res.status).toBe(200)
  })
})

describe('GET /api/recipes/[id] — T05, T13: detail and shared access', () => {
  beforeEach(() => { vi.resetModules() })

  it('T05: returns recipe data for owner', async () => {
    await setupMocks({
      selectResults: [
        [sampleRecipe],  // recipe lookup
        [],              // history query
      ],
    })

    const { GET } = await import('../[id]/route')
    const req = makeRequest('GET', `http://localhost/api/recipes/${sampleRecipe.id}`)
    const res = await GET(req, { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.id).toBe(sampleRecipe.id)
  })

  it('T13: returns shared recipe for non-owner', async () => {
    await setupMocks({
      user: { id: 'user-2', email: 'other@example.com', name: 'Other', image: null },
      selectResults: [
        [sharedRecipe],  // recipe lookup
        [],              // history query
      ],
    })

    const { GET } = await import('../[id]/route')
    const req = makeRequest('GET', `http://localhost/api/recipes/${sharedRecipe.id}`)
    const res = await GET(req, { params: { id: sharedRecipe.id } })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.is_shared).toBe(true)
  })

  it('returns 403 for non-shared recipe accessed by non-owner (IDOR fix)', async () => {
    const otherUser = { id: 'other-user', email: 'other@test.com', name: 'Other', image: null }
    const { checkOwnership } = await import('@/lib/household')
    vi.mocked(checkOwnership).mockResolvedValueOnce({ owned: false, status: 403 })

    await setupMocks({
      user: otherUser,
      selectResults: [
        [{ ...sampleRecipe, isShared: false }],  // recipe lookup
      ],
    })

    const { GET } = await import('../[id]/route')
    const req = makeRequest('GET', `http://localhost/api/recipes/${sampleRecipe.id}`)
    const res = await GET(req, { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/recipes/[id] — T08, T11: edit and ownership', () => {
  beforeEach(() => { vi.resetModules() })

  it('T08: owner can update a recipe', async () => {
    const updated = { ...sampleRecipe, title: 'Updated Pasta' }
    await setupMocks({
      selectResults: [
        [{ userId: 'user-1', householdId: null }],  // ownership check
      ],
      updateResult: [updated],
    })

    const { PATCH } = await import('../[id]/route')
    const req = makeRequest('PATCH', `http://localhost/api/recipes/${sampleRecipe.id}`, { title: 'Updated Pasta' })
    const res = await PATCH(req, { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(200)
  })

  it('T11: non-owner receives 403', async () => {
    await setupMocks({
      user: { id: 'user-2', email: 'other@example.com', name: 'Other', image: null },
      selectResults: [
        [{ userId: 'user-1', householdId: null }],  // ownership check — owned by user-1
      ],
    })

    const { PATCH } = await import('../[id]/route')
    const req = makeRequest('PATCH', `http://localhost/api/recipes/${sampleRecipe.id}`, { title: 'Hack' })
    const res = await PATCH(req, { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/recipes/[id] — T09, T12: delete and ownership', () => {
  beforeEach(() => { vi.resetModules() })

  it('T09: owner can delete a recipe', async () => {
    await setupMocks({
      selectResults: [
        [{ userId: 'user-1', householdId: null }],  // ownership check
      ],
    })

    const { DELETE } = await import('../[id]/route')
    const req = makeRequest('DELETE', `http://localhost/api/recipes/${sampleRecipe.id}`)
    const res = await DELETE(req, { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(204)
  })

  it('T12: non-owner receives 403', async () => {
    await setupMocks({
      user: { id: 'user-2', email: 'other@example.com', name: 'Other', image: null },
      selectResults: [
        [{ userId: 'user-1', householdId: null }],  // recipe owned by user-1
      ],
    })

    const { DELETE } = await import('../[id]/route')
    const req = makeRequest('DELETE', `http://localhost/api/recipes/${sampleRecipe.id}`)
    const res = await DELETE(req, { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/recipes/[id]/share — T10: share toggle', () => {
  beforeEach(() => { vi.resetModules() })

  it('T10: owner can set is_shared = true', async () => {
    const sharedResult = { ...sampleRecipe, isShared: true }
    await setupMocks({
      updateResult: [sharedResult],
    })

    const { checkOwnership } = await import('@/lib/household')
    vi.mocked(checkOwnership).mockResolvedValue({ owned: true })

    const { PATCH } = await import('../[id]/share/route')
    const req = makeRequest('PATCH', `http://localhost/api/recipes/${sampleRecipe.id}/share`, { is_shared: true })
    const res = await PATCH(req, { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(200)
  })
})

// ── T14: POST /api/recipes rejects unknown tag ────────────────────────────────

describe('T14 - POST /api/recipes rejects unknown tag with 400', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 400 when tag is not in first-class list or custom_tags', async () => {
    await setupMocks({ insertResult: [sampleRecipe] })

    const { validateTags } = await import('@/lib/tags-server')
    vi.mocked(validateTags).mockResolvedValue({ valid: false, unknownTags: ['NotARealTag'] })

    const { POST } = await import('../route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/recipes', {
        title: 'Test Recipe',
        category: 'main_dish',
        tags: ['NotARealTag'],
      }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Unknown tags/)
  })

  it('accepts a first-class tag without custom_tags lookup hit', async () => {
    const created = { ...sampleRecipe, tags: ['Chicken'] }
    await setupMocks({ insertResult: [created] })

    const { validateTags } = await import('@/lib/tags-server')
    vi.mocked(validateTags).mockResolvedValue({ valid: true })

    const { POST } = await import('../route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/recipes', {
        title: 'Test Recipe',
        category: 'main_dish',
        tags: ['Chicken'],
      }),
    )
    expect(res.status).toBe(201)
  })
})

// ── T14b: PATCH /api/recipes/[id] rejects unknown tag ────────────────────────

describe('T14b - PATCH /api/recipes/[id] rejects unknown tag with 400', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 400 when patched tag is not in first-class list or custom_tags', async () => {
    await setupMocks({
      selectResults: [
        [{ userId: 'user-1', householdId: null }],  // ownership check
      ],
    })

    const { validateTags } = await import('@/lib/tags-server')
    vi.mocked(validateTags).mockResolvedValue({ valid: false, unknownTags: ['FakeTag'] })

    const { PATCH } = await import('../[id]/route')
    const res = await PATCH(
      makeRequest('PATCH', `http://localhost/api/recipes/${sampleRecipe.id}`, {
        tags: ['FakeTag'],
      }),
      { params: { id: sampleRecipe.id } },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Unknown tags/)
  })
})

// ── T21: POST /api/recipes accepts and saves source field ────────────────────

describe('T21 - POST /api/recipes accepts and saves source field', () => {
  beforeEach(() => { vi.resetModules() })

  it('saves source: generated when provided', async () => {
    const insertResult = { ...sampleRecipe, source: 'generated' }
    await setupMocks({ insertResult: [insertResult] })

    const { POST } = await import('../route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/recipes', {
        title: 'Test Recipe',
        category: 'main_dish',
        tags: [],
        source: 'generated',
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.source).toBe('generated')
  })

  it('returns 400 when source is an invalid value', async () => {
    await setupMocks({})

    const { POST } = await import('../route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/recipes', {
        title: 'Test Recipe',
        category: 'main_dish',
        tags: [],
        source: 'invalid_source',
      }),
    )
    expect(res.status).toBe(400)
  })
})

// ── T22: POST /api/recipes defaults source to 'manual' when not supplied ──────

describe('T22 - POST /api/recipes defaults source to "manual" when not supplied', () => {
  beforeEach(() => { vi.resetModules() })

  it('inserts source: manual when source not in body', async () => {
    const insertResult = { ...sampleRecipe, source: 'manual' }
    await setupMocks({ insertResult: [insertResult] })

    const { POST } = await import('../route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/recipes', {
        title: 'Test Recipe',
        category: 'main_dish',
        tags: [],
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.source).toBe('manual')
  })
})

// ── T23: PATCH /api/recipes/[id] ignores source field ────────────────────────

describe('T23 - PATCH /api/recipes/[id] ignores source in request body', () => {
  beforeEach(() => { vi.resetModules() })

  it('succeeds without error when source is included in PATCH body', async () => {
    const updated = { ...sampleRecipe, title: 'Updated Title', source: 'manual' }
    await setupMocks({
      selectResults: [
        [{ userId: 'user-1', householdId: null }],  // ownership check
      ],
      updateResult: [updated],
    })

    const { PATCH } = await import('../[id]/route')
    const res = await PATCH(
      makeRequest('PATCH', `http://localhost/api/recipes/${sampleRecipe.id}`, {
        title: 'Updated Title',
        source: 'generated',  // should be silently ignored
      }),
      { params: { id: sampleRecipe.id } },
    )
    expect(res.status).toBe(200)
  })
})

// ── Spec-14: Household scope integration tests ────────────────────────────────

describe('T15 - solo GET returns only solo user recipes', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 200 with recipes for solo user (resolveHouseholdScope = null)', async () => {
    await setupMocks({
      selectResults: [
        [sampleRecipe],  // recipes query
        [],              // history query
      ],
    })

    const { GET } = await import('../route')
    const res = await GET(makeRequest('GET', 'http://localhost/api/recipes'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveLength(1)
    expect(json[0].id).toBe(sampleRecipe.id)
  })
})

describe('T16 - household GET returns recipes scoped to household_id', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 200 when user has household scope (resolveHouseholdScope returns ctx)', async () => {
    const { resolveHouseholdScope } = await import('@/lib/household')
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'member',
    })
    const householdRecipe = { ...sampleRecipe, id: 'recipe-hh', householdId: 'hh-1', userId: 'user-2' }
    await setupMocks({
      selectResults: [
        [householdRecipe],  // recipes query
        [],                  // history query
      ],
    })

    const { GET } = await import('../route')
    const res = await GET(makeRequest('GET', 'http://localhost/api/recipes'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveLength(1)
    expect(json[0].id).toBe('recipe-hh')
  })
})

describe('T17 - household POST sets household_id in insert payload', () => {
  beforeEach(() => { vi.resetModules() })

  it('includes household_id in the inserted recipe when user is in a household', async () => {
    const { resolveHouseholdScope } = await import('@/lib/household')
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'member',
    })

    const { scopeInsert } = await import('@/lib/household')
    vi.mocked(scopeInsert).mockReturnValue({ userId: 'user-1', householdId: 'hh-1' })

    const created = { ...sampleRecipe, id: 'recipe-new', householdId: 'hh-1' }
    await setupMocks({ insertResult: [created] })

    const { POST } = await import('../route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/recipes', {
        title: 'Household Recipe',
        category: 'main_dish',
        tags: [],
      }),
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.household_id).toBe('hh-1')
  })
})

describe('T18 - household member can delete another member\'s recipe', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 204 when household member deletes a recipe owned by a different member', async () => {
    const { resolveHouseholdScope } = await import('@/lib/household')
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'member',
    })

    // Recipe is owned by user-1 but belongs to hh-1; user-2 is the requester
    const memberOwnedRecipe = { userId: 'user-1', householdId: 'hh-1' }
    await setupMocks({
      user: { id: 'user-2', email: 'other@example.com', name: 'Other', image: null },
      selectResults: [
        [memberOwnedRecipe],  // ownership check
      ],
    })

    const { DELETE } = await import('../[id]/route')
    const res = await DELETE(
      makeRequest('DELETE', `http://localhost/api/recipes/${sampleRecipe.id}`),
      { params: { id: sampleRecipe.id } },
    )
    expect(res.status).toBe(204)
  })
})
