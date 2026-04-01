/**
 * Tests for import API routes
 * Covers spec-17 test cases: T03, T04, T07, T19, T20, T21, T22, T23, T25, T29, T30
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mocks ─────────────────────────────────────────────────────────────

const mockUser = { id: 'user-1' }

function makeVaultChain(vaultData: unknown[] = []) {
  const resolved = { data: vaultData, error: null }
  return {
    select:   vi.fn().mockReturnThis(),
    order:    vi.fn().mockReturnThis(),
    limit:    vi.fn().mockReturnThis(),
    eq:       vi.fn().mockResolvedValue(resolved),
    upsert:   vi.fn().mockResolvedValue({ error: null }),
    insert:   vi.fn().mockResolvedValue({ error: null }),
    update:   vi.fn().mockReturnThis(),
    single:   vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

function makeSupabaseMock(user = mockUser, vaultData: unknown[] = []) {
  const chain = makeVaultChain(vaultData)
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn(() => chain),
    _chain: chain,
  }
}

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient:  vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  // scopeQuery must call .eq() so the returned value is awaitable (a resolved Promise)
  scopeQuery:            vi.fn((q: { eq: (col: string, val: string) => unknown }) => q.eq('user_id', 'user-1')),
  scopeInsert:           vi.fn((_uid: unknown, _ctx: unknown, payload: unknown) => ({ ...(payload as object), user_id: 'user-1' })),
  checkOwnership:        vi.fn().mockResolvedValue({ owned: true }),
}))

import { createServerClient, createAdminClient } from '@/lib/supabase-server'

beforeEach(() => {
  vi.clearAllMocks()
})

// ── T03 — POST /api/import/urls returns job_id immediately ────────────────────

describe('POST /api/import/urls', () => {
  it('T03: returns 202 with job_id immediately before scraping completes', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    // Mock fetch for background scraping
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({ title: 'Test Recipe', ingredients: 'some', steps: 'do it', partial: false, suggestedTags: [] }),
    }))

    const { POST } = await import('../urls/route')
    const req = new Request('http://localhost/api/import/urls', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ urls: ['https://example.com/recipe1', 'https://example.com/recipe2'] }),
    })

    const res = await POST(req as never, undefined as never)
    expect(res.status).toBe(202)

    const body = await res.json() as { job_id: string; total: number }
    expect(typeof body.job_id).toBe('string')
    expect(body.total).toBe(2)
  })
})

// ── T04 — GET /api/import/[job_id] returns progress ───────────────────────────

describe('GET /api/import/[job_id]', () => {
  it('T04: returns job progress', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'Recipe', partial: false, suggestedTags: [] }),
    }))

    // Create a job first
    const { POST } = await import('../urls/route')
    const postReq = new Request('http://localhost/api/import/urls', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ urls: ['https://example.com/r1'] }),
    })
    const postRes = await POST(postReq as never, undefined as never)
    const { job_id } = await postRes.json() as { job_id: string }

    // GET the job
    const { GET } = await import('../[job_id]/route')
    const getReq = new Request(`http://localhost/api/import/${job_id}`)
    const getRes = await GET(getReq as never, { params: { job_id } } as never)

    expect(getRes.status).toBe(200)
    const data = await getRes.json() as { job_id: string; total: number; completed: number; results: unknown[] }
    expect(data.job_id).toBe(job_id)
    expect(data.total).toBe(1)
    expect(Array.isArray(data.results)).toBe(true)
  })

  it('returns 404 for unknown job_id', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    const { GET } = await import('../[job_id]/route')
    const req = new Request('http://localhost/api/import/nonexistent-job')
    const res = await GET(req as never, { params: { job_id: 'nonexistent-job' } } as never)
    expect(res.status).toBe(404)
  })

  it('T30: evicts jobs older than 30 minutes', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    // Directly inject an expired job
    const { importJobs } = await import('../urls/route')
    const expiredJobId = 'expired-job-123'
    importJobs.set(expiredJobId, {
      userId:    'user-1',
      total:     1,
      completed: 1,
      results:   [],
      createdAt: Date.now() - 31 * 60 * 1000, // 31 minutes ago
    })

    const { GET } = await import('../[job_id]/route')
    const req = new Request(`http://localhost/api/import/${expiredJobId}`)
    const res = await GET(req as never, { params: { job_id: expiredJobId } } as never)
    expect(res.status).toBe(404)
  })
})

// ── T07 — Duplicate URL detected ──────────────────────────────────────────────

describe('duplicate detection in file import', () => {
  it('T07: duplicate URL detected and flagged in results', async () => {
    const vaultData = [
      { id: 'existing-1', title: 'Chicken Soup', url: 'https://example.com/chicken-soup' },
    ]
    const mock = makeSupabaseMock(mockUser, vaultData)
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    const csvContent = [
      'title,ingredients,url',
      '"Chicken Soup","1 chicken, water","https://example.com/chicken-soup"',
    ].join('\n')

    const { POST } = await import('../file/route')
    const formData = new FormData()
    formData.append('file', new File([csvContent], 'recipes.csv', { type: 'text/csv' }))
    formData.append('format', 'csv')

    const req = new Request('http://localhost/api/import/file', {
      method: 'POST',
      body:   formData,
    })

    const res = await POST(req as never, undefined as never)
    expect(res.status).toBe(200)

    const data = await res.json() as { results: { duplicate?: { recipe_id: string } }[] }
    expect(data.results[0]!.duplicate).toBeDefined()
    expect(data.results[0]!.duplicate?.recipe_id).toBe('existing-1')
  })
})

// ── T23 — POST /api/import/save returns correct summary counts ────────────────

describe('POST /api/import/save', () => {
  const sampleRecipe = {
    title:                 'Test Recipe',
    category:              'main_dish' as const,
    ingredients:           '1 cup flour',
    steps:                 'Mix and bake',
    notes:                 null,
    url:                   null,
    image_url:             null,
    prep_time_minutes:     null,
    cook_time_minutes:     null,
    total_time_minutes:    null,
    inactive_time_minutes: null,
    servings:              null,
    tags:                  ['Quick'],
    source:                'manual' as const,
  }

  it('T23: returns correct imported/skipped/replaced/failed counts', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../save/route')
    const req = new Request('http://localhost/api/import/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        recipes: [
          { data: sampleRecipe },
          { data: { ...sampleRecipe, title: 'Skipped Recipe' }, duplicate_action: 'skip', existing_id: undefined },
        ],
      }),
    })

    const res = await POST(req as never, undefined as never)
    expect(res.status).toBe(200)

    const data = await res.json() as { imported: number; skipped: number; replaced: number; failed: unknown[] }
    expect(data.imported).toBe(1)
    expect(data.skipped).toBe(1)
    expect(data.replaced).toBe(0)
    expect(data.failed).toHaveLength(0)
  })

  it('T22: skip duplicate_action excludes from save', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../save/route')
    const req = new Request('http://localhost/api/import/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        recipes: [{ data: sampleRecipe, duplicate_action: 'skip' }],
      }),
    })

    const res = await POST(req as never, undefined as never)
    const data = await res.json() as { imported: number; skipped: number }
    expect(data.imported).toBe(0)
    expect(data.skipped).toBe(1)
  })

  it('T20+T21: replace uses UPDATE not DELETE+INSERT (preserves recipe_history)', async () => {
    const chain = makeVaultChain()
    const mockWithUpdate = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
      from: vi.fn(() => chain),
    }
    vi.mocked(createServerClient).mockReturnValue(mockWithUpdate as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mockWithUpdate as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../save/route')
    const req = new Request('http://localhost/api/import/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        recipes: [{
          data:             sampleRecipe,
          duplicate_action: 'replace',
          existing_id:      '550e8400-e29b-41d4-a716-446655440000',
        }],
      }),
    })

    const res = await POST(req as never, undefined as never)
    const data = await res.json() as { replaced: number }
    expect(data.replaced).toBe(1)

    // Verify UPDATE was called (not INSERT)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test Recipe' }),
    )
    expect(chain.insert).not.toHaveBeenCalled()
  })

  it('T19: keep_both inserts alongside existing', async () => {
    const chain = makeVaultChain()
    const mockDb = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }) },
      from: vi.fn(() => chain),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../save/route')
    const req = new Request('http://localhost/api/import/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        recipes: [{ data: sampleRecipe, duplicate_action: 'keep_both' }],
      }),
    })

    const res = await POST(req as never, undefined as never)
    const data = await res.json() as { imported: number }
    expect(data.imported).toBe(1)
    expect(chain.insert).toHaveBeenCalled()
    expect(chain.update).not.toHaveBeenCalled()
  })

  it('T25: failed recipe (no title) excluded from save', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../save/route')
    const req = new Request('http://localhost/api/import/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        recipes: [{
          data: {
            ...sampleRecipe,
            title: '   ', // whitespace-only title: passes min(1) schema but fails server-side trim guard
          },
        }],
      }),
    })

    const res = await POST(req as never, undefined as never)
    const data = await res.json() as { imported: number; failed: { title: string; error: string }[] }
    expect(data.imported).toBe(0)
    expect(data.failed).toHaveLength(1)
  })

  it('T29: unmatched tags saved as custom tags', async () => {
    const chain = makeVaultChain()
    const mockDb = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }) },
      from: vi.fn(() => chain),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../save/route')
    const req = new Request('http://localhost/api/import/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        recipes: [{
          data: {
            ...sampleRecipe,
            tags: ['Quick', 'MyCustomTag'], // Quick = first-class, MyCustomTag = custom
          },
        }],
      }),
    })

    await POST(req as never, undefined as never)

    // Verify custom_tags upsert was called for the unmatched tag
    expect(mockDb.from).toHaveBeenCalledWith('custom_tags')
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'MyCustomTag' }),
      expect.any(Object),
    )
  })
})
