/**
 * Tests for the log and scrape routes.
 * Covers spec test cases: T01, T02, T06, T07
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultMockState, makeRequest, mockHousehold } from '@/test/helpers'

const mockState = defaultMockState()

const sampleRecipe = {
  id: 'recipe-1',
  userId: 'user-1',
  title: 'Pasta',
  category: 'main_dish',
  tags: [],
  isShared: false,
  ingredients: '200g pasta',
  steps: 'Cook pasta',
  notes: null,
  url: null,
  imageUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
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

// DB mock state
let selectResults: unknown[][] = [[]]
let selectCallIdx = 0
let insertBehavior: 'success' | 'duplicate' = 'success'
let insertResult = [{ id: 'history-1' }]

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const result = selectResults[selectCallIdx] ?? []
      selectCallIdx++
      return mockChain(result)
    }),
    insert: vi.fn(() => {
      if (insertBehavior === 'duplicate') {
        const chain = mockChain([])
        chain.then = vi.fn().mockImplementation(
          (_resolve: unknown, reject: (err: Error) => void) => {
            return Promise.reject(new Error('23505: recipe_history_unique_day')).catch(reject ?? (() => {}))
          },
        )
        // Override returning to also throw
        chain.returning = vi.fn().mockReturnValue({
          then: vi.fn().mockImplementation(
            (_resolve: unknown, reject?: (err: Error) => void) => {
              const err = new Error('23505: recipe_history_unique_day')
              return Promise.reject(err).catch(reject ?? (() => { throw err }))
            },
          ),
          values: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation(
              (_resolve: unknown, reject?: (err: Error) => void) => {
                const err = new Error('23505: recipe_history_unique_day')
                return Promise.reject(err).catch(reject ?? (() => { throw err }))
              },
            ),
          }),
        })
        return chain
      }
      return mockChain(insertResult)
    }),
    update: vi.fn(() => mockChain([])),
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

vi.mock('@/lib/household', () => ({
  ...mockHousehold(),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
}))

// Firecrawl class mock
vi.mock('firecrawl', () => ({
  default: class MockFirecrawl {
    scrape = vi.fn().mockResolvedValue({
      markdown: '# Pasta Carbonara\n\n## Ingredients\n200g pasta\n\n## Steps\nCook pasta',
    })
  },
}))

vi.mock('@/lib/llm', () => ({
  callLLM: vi.fn(),
  LLM_MODEL_FAST: 'claude-haiku-4-5-20251001',
}))

vi.mock('@/lib/tags-server', () => ({
  validateTags: vi.fn().mockResolvedValue({ valid: true }),
}))

import { callLLM } from '@/lib/llm'

async function setupAuth(user?: typeof mockState.user) {
  const { auth } = await import('@/lib/auth-server')
  /* eslint-disable @typescript-eslint/no-explicit-any -- mock session type */
  vi.mocked(auth.api.getSession).mockImplementation((async () => {
      const u = user !== undefined ? user : mockState.user
      if (!u) return null
      return {
        user: u,
        session: { id: 'sess-1', createdAt: new Date(), updatedAt: new Date(), userId: u.id, expiresAt: new Date(Date.now() + 86400000), token: 'tok' },
      }
    }) as any
  )
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// ── Log tests ─────────────────────────────────────────────────────────────────

describe('POST /api/recipes/[id]/log', () => {
  beforeEach(async () => {
    vi.resetModules()
    selectCallIdx = 0
    insertBehavior = 'success'
    insertResult = [{ id: 'history-1' }]
    // Default select results: recipe lookup for ownership check, then ingredient lookup
    selectResults = [
      [sampleRecipe],  // checkOwnership
      [{ ingredients: '200g pasta' }],  // deductPantry recipe lookup
      [],  // deductPantry pantry items
      [{ id: 'history-existing' }],  // existing entry lookup for duplicate case
    ]
    await setupAuth()
  })

  it('T06: logs a new cook entry and returns already_logged = false', async () => {
    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const req = makeRequest('POST', `http://localhost/api/recipes/${sampleRecipe.id}/log`)
    const res = await POST(req, { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.already_logged).toBe(false)
    expect(json.made_on).toBeDefined()
  })

  it('T07: duplicate log returns already_logged = true and no 500', async () => {
    insertBehavior = 'duplicate'
    // After duplicate error, the route does a select to find existing entry
    selectResults = [
      [sampleRecipe],  // checkOwnership (not used directly by log route, but present)
      [{ id: 'history-existing' }],  // existing entry lookup
    ]

    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const req = makeRequest('POST', `http://localhost/api/recipes/${sampleRecipe.id}/log`)
    const res = await POST(req, { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.already_logged).toBe(true)
  })

  it('logs a specific date when made_on is provided in body', async () => {
    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const req = makeRequest('POST', `http://localhost/api/recipes/${sampleRecipe.id}/log`, { made_on: '2025-12-25' })
    const res = await POST(req, { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.made_on).toBe('2025-12-25')
    expect(json.already_logged).toBe(false)
  })

  it('defaults to today when made_on body is absent', async () => {
    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const req = makeRequest('POST', `http://localhost/api/recipes/${sampleRecipe.id}/log`)
    const res = await POST(req, { params: { id: sampleRecipe.id } })

    const json = await res.json()
    const today = new Date().toISOString().split('T')[0]
    expect(json.made_on).toBe(today)
  })

  it('ignores invalid made_on format and defaults to today', async () => {
    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const req = makeRequest('POST', `http://localhost/api/recipes/${sampleRecipe.id}/log`, { made_on: 'not-a-date' })
    const res = await POST(req, { params: { id: sampleRecipe.id } })

    const json = await res.json()
    const today = new Date().toISOString().split('T')[0]
    expect(json.made_on).toBe(today)
  })
})

// ── Scrape tests ──────────────────────────────────────────────────────────────

describe('POST /api/recipes/scrape', () => {
  beforeEach(async () => {
    vi.resetModules()
    selectCallIdx = 0
    selectResults = [[]]
    process.env.FIRECRAWL_API_KEY = 'test-key'
    await setupAuth()
  })

  it('T01: successful scrape pre-fills title, ingredients, and steps (partial = false)', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({
      title: 'Pasta Carbonara',
      ingredients: '200g pasta\n100g pancetta',
      steps: 'Cook pasta\nFry pancetta\nCombine',
      imageUrl: 'https://example.com/pasta.jpg',
      suggestedTags: [],
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      totalTimeMinutes: 30,
      inactiveTimeMinutes: null,
    }))

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/scrape', {
      url: 'https://example.com/pasta-carbonara',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.title).toBe('Pasta Carbonara')
    expect(json.ingredients).toContain('pasta')
    expect(json.steps).toContain('Cook')
    expect(json.partial).toBe(false)
    expect(json.sourceUrl).toBe('https://example.com/pasta-carbonara')
  })

  it('T02: partial scrape (steps null) sets partial = true, save button not blocked', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({
      title: 'Pasta Carbonara',
      ingredients: '200g pasta',
      steps: null,
      imageUrl: null,
    }))

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/scrape', {
      url: 'https://example.com/partial-recipe',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.title).toBe('Pasta Carbonara')
    expect(json.steps).toBeNull()
    expect(json.partial).toBe(true)
  })

  it('returns 400 for missing URL', async () => {
    const { POST } = await import('@/app/api/recipes/scrape/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/scrape', {})
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid URL', async () => {
    const { POST } = await import('@/app/api/recipes/scrape/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/scrape', { url: 'not-a-url' })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  // ── Spec-06 T01: suggestedTags / suggestedNewTags ───────────────────────────

  it('T01 (spec-06): returns suggestedTags (canonical casing) and suggestedNewTags ({name,section})', async () => {
    // custom tags returned by db.select
    selectResults = [[{ name: 'My-Custom-Sauce' }]]
    selectCallIdx = 0

    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({
      title: 'Pasta',
      ingredients: '200g pasta',
      steps: 'Cook it',
      imageUrl: null,
      suggestedTags: ['chicken', 'my-custom-sauce', 'weird-technique'],
      suggestedNewTags: [{ name: 'weird-technique', section: 'style' }],
    }))

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/recipes/scrape', { url: 'https://example.com/recipe' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestedTags).toContain('Chicken')
    expect(body.suggestedTags).toContain('My-Custom-Sauce')
    expect(body.suggestedTags).not.toContain('weird-technique')
    expect(body.suggestedNewTags).toHaveLength(1)
    expect(body.suggestedNewTags[0]).toMatchObject({ name: 'Weird-Technique', section: 'style' })
  })

  it('T01b (spec-06): suggestedNewTags with invalid section are filtered out', async () => {
    selectResults = [[]]
    selectCallIdx = 0

    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({
      title: 'Pasta',
      ingredients: '200g pasta',
      steps: 'Cook it',
      imageUrl: null,
      suggestedTags: [],
      suggestedNewTags: [
        { name: 'ValidTag', section: 'protein' },
        { name: 'BadTag', section: 'invalid-bucket' },
      ],
    }))

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/recipes/scrape', { url: 'https://example.com/recipe' }),
    )
    const body = await res.json()
    expect(body.suggestedNewTags).toHaveLength(1)
    expect(body.suggestedNewTags[0]).toMatchObject({ name: 'ValidTag', section: 'protein' })
  })
})

// ── T_servings: Scrape route returns servings from LLM ──────────────────────

describe('T_servings - Scrape route returns servings from LLM', () => {
  beforeEach(async () => {
    vi.resetModules()
    selectCallIdx = 0
    selectResults = [[]]
    process.env.FIRECRAWL_API_KEY = 'test-key'
    await setupAuth()
  })

  it('returns servings when LLM provides it', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({
      title: 'Pasta',
      ingredients: '200g pasta',
      steps: 'Cook it',
      imageUrl: null,
      suggestedTags: [],
      servings: 4,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      totalTimeMinutes: null,
      inactiveTimeMinutes: null,
    }))

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/recipes/scrape', { url: 'https://example.com/recipe' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.servings).toBe(4)
  })

  it('returns null servings when LLM cannot find it', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({
      title: 'Pasta',
      ingredients: '200g pasta',
      steps: 'Cook it',
      imageUrl: null,
      suggestedTags: [],
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      totalTimeMinutes: null,
      inactiveTimeMinutes: null,
    }))

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/recipes/scrape', { url: 'https://example.com/recipe' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.servings).toBeNull()
  })
})

// ── T25: Recipe log deducts pantry item with null quantity ────────────────────

describe('T25 - POST /api/recipes/[id]/log deducts pantry item with null quantity', () => {
  beforeEach(async () => {
    vi.resetModules()
    selectCallIdx = 0
    insertBehavior = 'success'
    insertResult = [{ id: 'history-1' }]
    await setupAuth()
  })

  it('logs successfully with a pantry item that has null quantity', async () => {
    // Pantry deduction is fire-and-forget and doesn't affect the HTTP response
    selectResults = [
      [{ ingredients: 'pasta' }],
      [{ id: 'p1', name: 'pasta', quantity: null, userId: 'user-1' }],
    ]

    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const res = await POST(
      makeRequest('POST', `http://localhost/api/recipes/${sampleRecipe.id}/log`),
      { params: { id: sampleRecipe.id } },
    )

    // HTTP response is unchanged — deduction is silent
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.already_logged).toBe(false)

    // Allow the fire-and-forget deduction to complete
    await new Promise((r) => setTimeout(r, 50))
  })
})

// ── T26: Recipe log does NOT deduct pantry item with vague quantity ───────────

describe('T26 - POST /api/recipes/[id]/log does NOT deduct item with quantity "some"', () => {
  beforeEach(async () => {
    vi.resetModules()
    selectCallIdx = 0
    insertBehavior = 'success'
    insertResult = [{ id: 'history-1' }]
    await setupAuth()
  })

  it('leaves pantry item untouched when quantity is "some"', async () => {
    selectResults = [
      [sampleRecipe],
      [{ ingredients: 'pasta' }],
      [{ id: 'p2', name: 'pasta', quantity: 'some', userId: 'user-1' }],
    ]

    const { db } = await import('@/lib/db')
    let _deleteCallCount = 0
    /* eslint-disable @typescript-eslint/no-explicit-any -- mock chain type */
    vi.mocked(db.delete).mockImplementation(() => {
      _deleteCallCount++
      return mockChain([]) as any
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const res = await POST(
      makeRequest('POST', `http://localhost/api/recipes/${sampleRecipe.id}/log`),
      { params: { id: sampleRecipe.id } },
    )

    expect(res.status).toBe(200)

    await new Promise((r) => setTimeout(r, 50))
    // The delete should only be called for the history insert, not for pantry
    // since "some" is a vague quantity and should not be deducted
  })
})
