/**
 * Tests for import API routes
 * Covers spec-17 test cases: T03, T04, T07, T19, T20, T21, T22, T23, T25, T29, T30
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock state ─────────────────────────────────────────────────────────────────

let mockVaultData: unknown[] = []
let _mockInsertCalled = false
let _mockUpdateCalledWith: unknown = null
let _mockUpsertCalledWith: unknown = null

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
  recipes: { id: 'id', userId: 'userId', householdId: 'householdId', title: 'title', url: 'url', category: 'category', tags: 'tags', ingredients: 'ingredients', steps: 'steps', notes: 'notes', imageUrl: 'imageUrl', source: 'source', prepTimeMinutes: 'prepTimeMinutes', cookTimeMinutes: 'cookTimeMinutes', totalTimeMinutes: 'totalTimeMinutes', inactiveTimeMinutes: 'inactiveTimeMinutes', servings: 'servings' },
  customTags: { name: 'name', userId: 'userId' },
}))

vi.mock('@/lib/db/helpers', () => ({
  dbFirst: (rows: unknown[]) => rows[0] ?? null,
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  scopeCondition: vi.fn().mockReturnValue({}),
  scopeInsert: vi.fn((userId: string) => ({ userId })),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
}))

async function setupDbMocks(vaultData: unknown[] = []) {
  mockVaultData = vaultData
  _mockInsertCalled = false
  _mockUpdateCalledWith = null
  _mockUpsertCalledWith = null

  const { db } = await import('@/lib/db')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(db.select).mockReturnValue(mockChain(mockVaultData) as any)

  const insertChain = mockChain([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(insertChain as any).values = vi.fn().mockImplementation((_payload: unknown) => {
    _mockInsertCalled = true
    return insertChain
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(db.insert).mockReturnValue(insertChain as any)

  const updateChain = mockChain([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(updateChain as any).set = vi.fn().mockImplementation((payload: unknown) => {
    _mockUpdateCalledWith = payload
    return updateChain
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(db.update).mockReturnValue(updateChain as any)
}

beforeEach(async () => {
  vi.clearAllMocks()
  const { auth } = await import('@/lib/auth-server')
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', image: null },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

  await setupDbMocks()
})

// ── T03 — POST /api/import/urls returns job_id immediately ────────────────────

describe('POST /api/import/urls', () => {
  it('T03: returns 202 with job_id immediately before scraping completes', async () => {

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

    const { GET } = await import('../[job_id]/route')
    const req = new Request('http://localhost/api/import/nonexistent-job')
    const res = await GET(req as never, { params: { job_id: 'nonexistent-job' } } as never)
    expect(res.status).toBe(404)
  })

  it('T30: evicts jobs older than 30 minutes', async () => {

    // Directly inject an expired job via the shared store
    const { createJob, getJob } = await import('@/lib/import-jobs')
    const expiredJobId = 'expired-job-123'
    createJob(expiredJobId, 'user-1', ['https://example.com/recipe'])
    const expiredJob = getJob(expiredJobId)!
    expiredJob.createdAt = Date.now() - 31 * 60 * 1000 // 31 minutes ago

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
    await setupDbMocks(vaultData)

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

    const data = await res.json() as { results: { duplicate?: { recipeId: string } }[] }
    expect(data.results[0]!.duplicate).toBeDefined()
    expect(data.results[0]!.duplicate?.recipeId).toBe('existing-1')
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
    imageUrl:             null,
    prepTimeMinutes:     null,
    cookTimeMinutes:     null,
    totalTimeMinutes:    null,
    inactiveTimeMinutes: null,
    servings:              null,
    tags:                  ['Quick'],
    source:                'manual' as const,
  }

  it('T23: returns correct imported/skipped/replaced/failed counts', async () => {

    const { POST } = await import('../save/route')
    const req = new Request('http://localhost/api/import/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        recipes: [
          { data: sampleRecipe },
          { data: { ...sampleRecipe, title: 'Skipped Recipe' }, duplicateAction: 'skip', existingId: undefined },
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

  it('T22: skip duplicateAction excludes from save', async () => {

    const { POST } = await import('../save/route')
    const req = new Request('http://localhost/api/import/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        recipes: [{ data: sampleRecipe, duplicateAction: 'skip' }],
      }),
    })

    const res = await POST(req as never, undefined as never)
    const data = await res.json() as { imported: number; skipped: number }
    expect(data.imported).toBe(0)
    expect(data.skipped).toBe(1)
  })

  it('T20+T21: replace uses UPDATE not DELETE+INSERT (preserves recipe_history)', async () => {
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.update).mockReturnValue(mockChain([{ id: '550e8400-e29b-41d4-a716-446655440000' }]) as any)

    const { POST } = await import('../save/route')
    const req = new Request('http://localhost/api/import/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        recipes: [{
          data:             sampleRecipe,
          duplicateAction: 'replace',
          existingId:      '550e8400-e29b-41d4-a716-446655440000',
        }],
      }),
    })

    const res = await POST(req as never, undefined as never)
    const data = await res.json() as { replaced: number }
    expect(data.replaced).toBe(1)
    expect(db.update).toHaveBeenCalled()
  })

  it('T19: keep_both inserts alongside existing', async () => {
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.insert).mockReturnValue(mockChain([]) as any)

    const { POST } = await import('../save/route')
    const req = new Request('http://localhost/api/import/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        recipes: [{ data: sampleRecipe, duplicateAction: 'keep_both' }],
      }),
    })

    const res = await POST(req as never, undefined as never)
    const data = await res.json() as { imported: number }
    expect(data.imported).toBe(1)
    expect(db.insert).toHaveBeenCalled()
  })

  it('T25: failed recipe (no title) excluded from save', async () => {

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
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.insert).mockReturnValue(mockChain([]) as any)

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

    // Verify insert was called (for custom tag + recipe)
    expect(db.insert).toHaveBeenCalled()
  })
})
