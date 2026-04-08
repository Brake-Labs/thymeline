/**
 * Tests for POST /api/recipes/export/pdf
 * Covers: T01–T08, T14
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultMockState, makeRequest, mockHousehold } from '@/test/helpers'

const mockState = defaultMockState()

const sampleRecipe = {
  id: 'a0000000-0000-4000-8000-000000000001',
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
  url: null,
}

const sampleRecipe2 = {
  ...sampleRecipe,
  id: 'a0000000-0000-4000-8000-000000000002',
  title: 'Simple Salad',
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

vi.mock('@/lib/pdf-generator', () => ({
  generateRecipePdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])),
}))

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

describe('POST /api/recipes/export/pdf', () => {
  beforeEach(() => { vi.resetModules() })

  it('T01: valid request returns 200 with application/pdf content type', async () => {
    await setupMocks({ selectResults: [[sampleRecipe]] })
    const { POST } = await import('../pdf/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/export/pdf', {
      recipe_ids: [sampleRecipe.id],
      format: 'single',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
  })

  it('T02: empty recipe_ids returns 400', async () => {
    await setupMocks()
    const { POST } = await import('../pdf/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/export/pdf', {
      recipe_ids: [],
      format: 'single',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('T03: >50 IDs returns 400', async () => {
    await setupMocks()
    const { POST } = await import('../pdf/route')
    const ids = Array.from({ length: 51 }, (_, i) =>
      `a0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    )
    const req = makeRequest('POST', 'http://localhost/api/recipes/export/pdf', {
      recipe_ids: ids,
      format: 'cookbook',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('T04: inaccessible recipe returns 403', async () => {
    // Return empty results (no matching recipes in scope)
    await setupMocks({ selectResults: [[]] })
    const { POST } = await import('../pdf/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/export/pdf', {
      recipe_ids: [sampleRecipe.id],
      format: 'single',
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('T05: single format with 1 ID succeeds', async () => {
    await setupMocks({ selectResults: [[sampleRecipe]] })
    const { POST } = await import('../pdf/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/export/pdf', {
      recipe_ids: [sampleRecipe.id],
      format: 'single',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('T06: cookbook format with multiple IDs succeeds', async () => {
    await setupMocks({ selectResults: [[sampleRecipe, sampleRecipe2]] })
    const { POST } = await import('../pdf/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/export/pdf', {
      recipe_ids: [sampleRecipe.id, sampleRecipe2.id],
      format: 'cookbook',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('T07: Content-Disposition filename is slugified title for single', async () => {
    await setupMocks({ selectResults: [[sampleRecipe]] })
    const { POST } = await import('../pdf/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/export/pdf', {
      recipe_ids: [sampleRecipe.id],
      format: 'single',
    })
    const res = await POST(req)
    const cd = res.headers.get('Content-Disposition') ?? ''
    expect(cd).toContain('pasta-carbonara.pdf')
  })

  it('T08: Content-Disposition filename includes date for cookbook', async () => {
    await setupMocks({ selectResults: [[sampleRecipe, sampleRecipe2]] })
    const { POST } = await import('../pdf/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/export/pdf', {
      recipe_ids: [sampleRecipe.id, sampleRecipe2.id],
      format: 'cookbook',
    })
    const res = await POST(req)
    const cd = res.headers.get('Content-Disposition') ?? ''
    const dateStr = new Date().toISOString().slice(0, 10)
    expect(cd).toContain(`thymeline-recipes-${dateStr}.pdf`)
  })

  it('T14: household member can export recipes they have access to', async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- mock types */
    const { resolveHouseholdScope } = await import('@/lib/household')
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'member',
    } as any)
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const hhRecipe = { ...sampleRecipe, householdId: 'hh-1', userId: 'user-2' }
    await setupMocks({ selectResults: [[hhRecipe]] })

    const { POST } = await import('../pdf/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/export/pdf', {
      recipe_ids: [sampleRecipe.id],
      format: 'single',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})
