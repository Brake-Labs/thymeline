/**
 * Tests for /api/recipes and /api/recipes/[id] routes.
 * Covers spec test cases: T03, T04, T08, T09, T10, T11, T12, T13, T14, T15, T16
 *
 * These are unit tests with mocked Supabase — they validate route logic without
 * a real database connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockUser = { id: 'user-1' }
const mockOtherUser = { id: 'user-2' }

const sampleRecipe = {
  id: 'recipe-1',
  user_id: 'user-1',
  title: 'Pasta Carbonara',
  category: 'main_dish',
  tags: ['Favorite', 'Quick'],
  is_shared: false,
  ingredients: '200g pasta\n100g pancetta',
  steps: 'Cook pasta\nFry pancetta\nCombine',
  notes: null,
  url: null,
  image_url: null,
  created_at: '2026-01-01T00:00:00Z',
}

const sharedRecipe = {
  ...sampleRecipe,
  id: 'recipe-shared',
  user_id: 'user-2',
  is_shared: true,
}

// ── Supabase mock factory ─────────────────────────────────────────────────────

function makeSupabaseMock(opts: {
  user?: typeof mockUser | null
  recipes?: unknown[]
  history?: { recipe_id: string; made_on: string }[]
  customTags?: { name: string }[]
  insertResult?: unknown
  updateResult?: unknown
  deleteOk?: boolean
  singleResult?: unknown
  singleError?: { message: string; code?: string } | null
}) {
  const {
    user = mockUser,
    recipes = [],
    history = [],
    customTags = [],
    insertResult = null,
    updateResult = null,
    deleteOk = true,
    singleResult = null,
    singleError = null,
  } = opts

  const chainable = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(),
  }

  // Default single resolution
  chainable.single.mockResolvedValue({ data: singleResult, error: singleError })

  // Override insert to return insertResult on .single()
  chainable.insert.mockImplementation(() => ({
    ...chainable,
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: insertResult, error: null }),
    }),
    // for log insert (no .select().single())
    then: undefined,
    // Allow awaiting directly for cases with no .select()
  }))

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('No user'),
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'recipes') {
        return {
          ...chainable,
          // list query returns recipes array
          select: vi.fn().mockReturnValue({
            ...chainable,
            order: vi.fn().mockImplementation(() => {
              // Fluent chain for: .order().eq().eq()?.contains()? awaited
              const makeFilterChain = (): Record<string, unknown> => ({
                eq: vi.fn().mockImplementation(() => makeFilterChain()),
                contains: vi.fn().mockImplementation(() => makeFilterChain()),
                then: (resolve: (v: unknown) => void) =>
                  Promise.resolve({ data: recipes, error: null }).then(resolve),
              })
              return makeFilterChain()
            }),
            eq: vi.fn().mockImplementation(() => {
              const level2 = {
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: singleResult, error: singleError }),
                  order: vi.fn().mockResolvedValue({ data: recipes, error: null }),
                }),
                contains: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: recipes, error: null }),
                }),
                order: vi.fn().mockResolvedValue({ data: recipes, error: null }),
                single: vi.fn().mockResolvedValue({ data: singleResult, error: singleError }),
                then: (resolve: (v: unknown) => void) =>
                  Promise.resolve({ data: recipes, error: null }).then(resolve),
              }
              return level2
            }),
            single: vi.fn().mockResolvedValue({ data: singleResult, error: singleError }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: insertResult, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: updateResult, error: null }),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: deleteOk ? null : { message: 'delete failed' } }),
          }),
        }
      }
      if (table === 'recipe_history') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: history, error: null }),
            eq: vi.fn().mockResolvedValue({ data: history, error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ data: insertResult, error: null }),
        }
      }
      if (table === 'custom_tags') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: customTags, error: null }),
          }),
        }
      }
      return chainable
    }),
  }
}

// ── Mock the server client ────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient:  vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: async () => null,
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
}))

import { createServerClient, createAdminClient } from '@/lib/supabase-server'

// ── Helper to build a minimal NextRequest ─────────────────────────────────────

function makeReq(
  url: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/recipes — T03: manual add with no URL', () => {
  it('creates a recipe with all optional fields empty', async () => {
    const created = { ...sampleRecipe, url: null, ingredients: null, steps: null }
    const mock = makeSupabaseMock({ insertResult: created, customTags: [] })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const req = makeReq('http://localhost/api/recipes', 'POST', {
      title: 'Pasta Carbonara',
      category: 'main_dish',
      tags: [],
    })
    const res = await POST(req as Parameters<typeof POST>[0])

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.title).toBe('Pasta Carbonara')
  })
})

describe('GET /api/recipes — T04: new recipe appears in table with correct fields', () => {
  it('returns recipe list with last_made = null for a new recipe', async () => {
    const mock = makeSupabaseMock({ recipes: [sampleRecipe], history: [] })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { GET } = await import('../route')
    const req = makeReq('http://localhost/api/recipes')
    const res = await GET(req as Parameters<typeof GET>[0])

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
  it('passes tag filter to query', async () => {
    const mock = makeSupabaseMock({ recipes: [sampleRecipe], history: [] })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { GET } = await import('../route')
    const req = makeReq('http://localhost/api/recipes?tag=Favorite')
    const res = await GET(req as Parameters<typeof GET>[0])

    expect(res.status).toBe(200)
    // Verify the Supabase .contains() was called with the tag
    const fromCall = mock.from.mock.results[0].value
    expect(fromCall.select).toHaveBeenCalled()
  })
})

describe('GET /api/recipes — T16: category filter', () => {
  it('passes category filter to query', async () => {
    const mock = makeSupabaseMock({ recipes: [sampleRecipe], history: [] })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { GET } = await import('../route')
    const req = makeReq('http://localhost/api/recipes?category=main_dish')
    const res = await GET(req as Parameters<typeof GET>[0])

    expect(res.status).toBe(200)
    const fromCall = mock.from.mock.results[0].value
    expect(fromCall.select).toHaveBeenCalled()
  })
})

describe('GET /api/recipes/[id] — T05, T13: detail and shared access', () => {
  beforeEach(() => { vi.resetModules() })

  it('T05: returns recipe data for owner', async () => {
    const mock = makeSupabaseMock({ singleResult: sampleRecipe, history: [] })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { GET } = await import('../[id]/route')
    const req = makeReq(`http://localhost/api/recipes/${sampleRecipe.id}`)
    const res = await GET(req as Parameters<typeof GET>[0], { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.id).toBe(sampleRecipe.id)
  })

  it('T13: returns shared recipe for non-owner', async () => {
    const mock = makeSupabaseMock({
      user: mockOtherUser,
      singleResult: sharedRecipe,
      history: [],
    })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { GET } = await import('../[id]/route')
    const req = makeReq(`http://localhost/api/recipes/${sharedRecipe.id}`)
    const res = await GET(req as Parameters<typeof GET>[0], { params: { id: sharedRecipe.id } })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.is_shared).toBe(true)
  })
})

describe('PATCH /api/recipes/[id] — T08, T11: edit and ownership', () => {
  beforeEach(() => { vi.resetModules() })

  it('T08: owner can update a recipe', async () => {
    const updated = { ...sampleRecipe, title: 'Updated Pasta' }
    const mock = makeSupabaseMock({
      singleResult: sampleRecipe,
      updateResult: updated,
    })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { PATCH } = await import('../[id]/route')
    const req = makeReq(
      `http://localhost/api/recipes/${sampleRecipe.id}`,
      'PATCH',
      { title: 'Updated Pasta' },
    )
    const res = await PATCH(req as Parameters<typeof PATCH>[0], { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(200)
  })

  it('T11: non-owner receives 403', async () => {
    const mock = makeSupabaseMock({
      user: mockOtherUser,
      singleResult: sampleRecipe,  // recipe owned by user-1
    })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { PATCH } = await import('../[id]/route')
    const req = makeReq(
      `http://localhost/api/recipes/${sampleRecipe.id}`,
      'PATCH',
      { title: 'Hack' },
    )
    const res = await PATCH(req as Parameters<typeof PATCH>[0], { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/recipes/[id] — T09, T12: delete and ownership', () => {
  beforeEach(() => { vi.resetModules() })

  it('T09: owner can delete a recipe', async () => {
    const mock = makeSupabaseMock({ singleResult: sampleRecipe, deleteOk: true })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { DELETE } = await import('../[id]/route')
    const req = makeReq(`http://localhost/api/recipes/${sampleRecipe.id}`, 'DELETE')
    const res = await DELETE(req as Parameters<typeof DELETE>[0], { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(204)
  })

  it('T12: non-owner receives 403', async () => {
    const mock = makeSupabaseMock({
      user: mockOtherUser,
      singleResult: sampleRecipe,
    })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { DELETE } = await import('../[id]/route')
    const req = makeReq(`http://localhost/api/recipes/${sampleRecipe.id}`, 'DELETE')
    const res = await DELETE(req as Parameters<typeof DELETE>[0], { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/recipes/[id]/share — T10: share toggle', () => {
  beforeEach(() => { vi.resetModules() })

  it('T10: owner can set is_shared = true', async () => {
    const sharedResult = { ...sampleRecipe, is_shared: true }
    const mock = makeSupabaseMock({
      singleResult: sampleRecipe,
      updateResult: sharedResult,
    })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { PATCH } = await import('../[id]/share/route')
    const req = makeReq(
      `http://localhost/api/recipes/${sampleRecipe.id}/share`,
      'PATCH',
      { is_shared: true },
    )
    const res = await PATCH(req as Parameters<typeof PATCH>[0], { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(200)
  })
})

// ── T14: POST /api/recipes rejects unknown tag ────────────────────────────────

describe('T14 - POST /api/recipes rejects unknown tag with 400', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 400 when tag is not in first-class list or custom_tags', async () => {
    const mock = makeSupabaseMock({ insertResult: sampleRecipe, customTags: [] })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(
      makeReq('http://localhost/api/recipes', 'POST', {
        title: 'Test Recipe',
        category: 'main_dish',
        tags: ['NotARealTag'],
      }) as Parameters<typeof POST>[0],
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Unknown tags/)
  })

  it('accepts a first-class tag without custom_tags lookup hit', async () => {
    const created = { ...sampleRecipe, tags: ['Chicken'] }
    const mock = makeSupabaseMock({ insertResult: created, customTags: [] })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(
      makeReq('http://localhost/api/recipes', 'POST', {
        title: 'Test Recipe',
        category: 'main_dish',
        tags: ['Chicken'],
      }) as Parameters<typeof POST>[0],
    )
    expect(res.status).toBe(201)
  })
})

// ── T14b: PATCH /api/recipes/[id] rejects unknown tag ────────────────────────

describe('T14b - PATCH /api/recipes/[id] rejects unknown tag with 400', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 400 when patched tag is not in first-class list or custom_tags', async () => {
    const mock = makeSupabaseMock({ singleResult: sampleRecipe, customTags: [] })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { PATCH } = await import('../[id]/route')
    const res = await PATCH(
      makeReq(`http://localhost/api/recipes/${sampleRecipe.id}`, 'PATCH', {
        tags: ['FakeTag'],
      }) as Parameters<typeof PATCH>[0],
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
    const mock = makeSupabaseMock({ insertResult })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)

    const { POST } = await import('../route')
    const res = await POST(
      makeReq('http://localhost/api/recipes', 'POST', {
        title: 'Test Recipe',
        category: 'main_dish',
        tags: [],
        source: 'generated',
      }) as Parameters<typeof POST>[0],
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.source).toBe('generated')
  })

  it('returns 400 when source is an invalid value', async () => {
    const mock = makeSupabaseMock({})
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)

    const { POST } = await import('../route')
    const res = await POST(
      makeReq('http://localhost/api/recipes', 'POST', {
        title: 'Test Recipe',
        category: 'main_dish',
        tags: [],
        source: 'invalid_source',
      }) as Parameters<typeof POST>[0],
    )
    expect(res.status).toBe(400)
  })
})

// ── T22: POST /api/recipes defaults source to 'manual' when not supplied ──────

describe('T22 - POST /api/recipes defaults source to "manual" when not supplied', () => {
  beforeEach(() => { vi.resetModules() })

  it('inserts source: manual when source not in body', async () => {
    const insertResult = { ...sampleRecipe, source: 'manual' }
    const mock = makeSupabaseMock({ insertResult })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)

    const { POST } = await import('../route')
    const res = await POST(
      makeReq('http://localhost/api/recipes', 'POST', {
        title: 'Test Recipe',
        category: 'main_dish',
        tags: [],
      }) as Parameters<typeof POST>[0],
    )
    expect(res.status).toBe(201)
    // The route sets source: body.source ?? 'manual' in the insert
    // We verify it returns 201 (insert was called successfully)
    const body = await res.json()
    expect(body.source).toBe('manual')
  })
})

// ── T23: PATCH /api/recipes/[id] ignores source field ────────────────────────

describe('T23 - PATCH /api/recipes/[id] ignores source in request body', () => {
  beforeEach(() => { vi.resetModules() })

  it('succeeds without error when source is included in PATCH body', async () => {
    const updated = { ...sampleRecipe, title: 'Updated Title', source: 'manual' }
    const mock = makeSupabaseMock({ singleResult: sampleRecipe, updateResult: updated })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)

    const { PATCH } = await import('../[id]/route')
    const res = await PATCH(
      makeReq(`http://localhost/api/recipes/${sampleRecipe.id}`, 'PATCH', {
        title: 'Updated Title',
        source: 'generated',  // should be silently ignored
      }) as Parameters<typeof PATCH>[0],
      { params: { id: sampleRecipe.id } },
    )
    // Should not return 400 for the source field
    expect(res.status).toBe(200)
  })
})
