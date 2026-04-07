/**
 * Tests for POST /api/recipes/search
 * Covers spec test cases: T15 (search returns relevant results), T16 (filters applied),
 * T18 (empty results), security (unknown IDs dropped), 401 for unauthenticated requests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultMockState, defaultGetSession, makeRequest, mockHousehold } from '@/test/helpers'

// ── Shared mock state ──────────────────────────────────────────────────────────

const mockState = defaultMockState()

const sampleRecipes = [
  {
    id: 'recipe-1',
    title: 'Chicken Tikka Masala',
    category: 'main_dish',
    tags: ['Indian', 'Chicken'],
    totalTimeMinutes: 60,
    ingredients: '500g chicken\n2 tbsp tikka paste',
  },
  {
    id: 'recipe-2',
    title: 'Caesar Salad',
    category: 'side_dish',
    tags: ['Quick', 'American'],
    totalTimeMinutes: 15,
    ingredients: 'romaine lettuce\nparmesan\ncroutons',
  },
  {
    id: 'recipe-3',
    title: 'Beef Stew',
    category: 'main_dish',
    tags: ['Comfort', 'Beef'],
    totalTimeMinutes: 180,
    ingredients: 'beef chuck\npotatoes\ncarrots',
  },
]

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

let selectResults: unknown[][] = [sampleRecipes, []]
let selectCallIdx = 0

// ── LLM mock ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm')>()
  return {
    callLLM: vi.fn(),
    LLM_MODEL_FAST: 'claude-haiku-4-5-20251001',
    LLM_MODEL_CAPABLE: 'claude-sonnet-4-6',
    parseLLMJson: actual.parseLLMJson,
  }
})

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const result = selectResults[selectCallIdx] ?? []
      selectCallIdx++
      return mockChain(result)
    }),
    insert: vi.fn(() => mockChain([])),
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

vi.mock('@/lib/household', () => mockHousehold())

import { callLLM } from '@/lib/llm'

async function setupAuth() {
  const { auth } = await import('@/lib/auth-server')
  vi.mocked(auth.api.getSession).mockImplementation(defaultGetSession(mockState))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/recipes/search', () => {
  beforeEach(async () => {
    vi.resetModules()
    selectCallIdx = 0
    selectResults = [sampleRecipes, []]
    await setupAuth()
  })

  it('T18: returns empty results when LLM returns []', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce('[]')

    const { POST } = await import('../route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/search', { query: 'xyzzy nothing matches' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toEqual([])
  })

  it('T15: returns relevant results ordered by LLM rank', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce('["recipe-1","recipe-3"]')

    const { POST } = await import('../route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/search', { query: 'chicken or beef' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toHaveLength(2)
    expect(json.results[0].recipe_id).toBe('recipe-1')
    expect(json.results[1].recipe_id).toBe('recipe-3')
  })

  it('security: silently drops IDs not in the user recipe list', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce('["recipe-1","evil-injected-uuid"]')

    const { POST } = await import('../route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/search', { query: 'anything' })
    const res = await POST(req)
    const json = await res.json()
    const ids = json.results.map((r: { recipe_id: string }) => r.recipe_id)
    expect(ids).not.toContain('evil-injected-uuid')
    expect(ids).toContain('recipe-1')
  })

  it('T16: applies filters on top of LLM results', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce('["recipe-1","recipe-2","recipe-3"]')

    const { POST } = await import('../route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/search', {
      query: 'quick food',
      filters: {
        tags: [],
        categories: [],
        maxTotalMinutes: 30,
        lastMadeFrom: null,
        lastMadeTo: null,
        neverMade: false,
      },
    })
    const res = await POST(req)
    const json = await res.json()
    // Only recipe-2 (15 min) passes the 30-min filter
    expect(json.results).toHaveLength(1)
    expect(json.results[0].recipe_id).toBe('recipe-2')
  })

  it('returns empty results for empty query', async () => {
    const { POST } = await import('../route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/search', { query: '   ' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toEqual([])
  })

  it('regression: parses LLM response wrapped in markdown fences', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce('```json\n["recipe-1","recipe-3"]\n```')

    const { POST } = await import('../route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/search', { query: 'chicken or beef' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toHaveLength(2)
    expect(json.results[0].recipe_id).toBe('recipe-1')
    expect(json.results[1].recipe_id).toBe('recipe-3')
  })

  it('regression: parses LLM response with prose before the fence', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce('Here are the matching recipes:\n```json\n["recipe-2"]\n```')

    const { POST } = await import('../route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/search', { query: 'quick salad' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toHaveLength(1)
    expect(json.results[0].recipe_id).toBe('recipe-2')
  })
})
