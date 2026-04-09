/**
 * Tests for POST /api/discover
 * Covers spec-16 test cases: T03, T04, T05, T06, T07
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Auth mock ─────────────────────────────────────────────────────────────────

const _mockUser = { id: 'user-1' }

const vaultRecipes = [
  { title: 'Chicken Stir Fry', tags: ['Chicken', 'Quick'], category: 'main_dish' },
  { title: 'Beef Tacos',        tags: ['Beef', 'Mexican'],  category: 'main_dish' },
]

function mockDbChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  for (const m of ['from','select','where','orderBy','limit','offset','innerJoin','leftJoin','set','values','onConflictDoUpdate','onConflictDoNothing','returning','groupBy']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve))
  return chain
}

vi.mock('@/lib/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn() },
}))

vi.mock('@/lib/db/schema', () => ({
  recipes: { title: 'title', tags: 'tags', category: 'category', userId: 'userId', householdId: 'householdId', createdAt: 'createdAt' },
}))

vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('drizzle-orm', () => ({
  desc: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  scopeCondition: vi.fn().mockReturnValue({}),
}))

// ── LLM mock ──────────────────────────────────────────────────────────────────

const mockCallLLM = vi.fn()
const mockCallLLMMultimodal = vi.fn()
vi.mock('@/lib/llm', () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
  callLLMMultimodal: (...args: unknown[]) => mockCallLLMMultimodal(...args),
  parseLLMJson: (text: string) => {
    const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
    return JSON.parse(stripped)
  },
  LLM_MODEL_CAPABLE: 'claude-sonnet-4-6',
}))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth-server'

function setupMocks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(db.select).mockReturnValue(mockDbChain(vaultRecipes) as any)
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', image: null },
    session: { id: 'sess-1', createdAt: new Date(), updatedAt: new Date(), userId: 'user-1', expiresAt: new Date(Date.now() + 86400000), token: 'tok' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

function setupUnauthMocks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(db.select).mockReturnValue(mockDbChain(vaultRecipes) as any)
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
}

beforeEach(() => {
  mockCallLLM.mockClear()
  mockCallLLMMultimodal.mockClear()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/discover', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

const sampleSearchResults = [
  {
    url: 'https://budgetbytes.com/recipes/chicken-stir-fry',
    title: 'Easy Chicken Stir Fry',
    siteName: 'budgetbytes.com',
    description: 'A quick weeknight dinner.',
  },
  {
    url: 'https://seriouseats.com/beef-stew-recipe',
    title: 'Classic Beef Stew',
    siteName: 'seriouseats.com',
    description: 'Rich and hearty.',
  },
]

const rankedResults = [
  {
    url: 'https://budgetbytes.com/recipes/chicken-stir-fry',
    title: 'Easy Chicken Stir Fry',
    siteName: 'budgetbytes.com',
    description: 'A quick weeknight dinner.',
    suggestedTags: ['Chicken', 'Quick'],
    vaultMatch: {
      similarRecipeTitle: 'Chicken Stir Fry',
      similarity: 'similar',
    },
  },
  {
    url: 'https://seriouseats.com/beef-stew-recipe',
    title: 'Classic Beef Stew',
    siteName: 'seriouseats.com',
    description: 'Rich and hearty.',
    suggestedTags: ['Beef', 'Comfort'],
  },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/discover — T03: returns 400 for empty query', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 400 when query is missing', async () => {
    setupMocks()

    const { POST } = await import('../route')
    const res = await POST(makeReq({}) as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Query is required')
  })

  it('returns 400 when query is whitespace only', async () => {
    setupMocks()

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: '   ' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
  })
})

describe('POST /api/discover — T04: returns results array', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 200 with results when LLM and web search succeed', async () => {
    setupMocks()

    // Step 2 — query gen (callLLM returns string)
    mockCallLLM
      .mockResolvedValueOnce('["easy chicken stir fry recipe", "quick chicken stir fry weeknight"]')
      // Step 4 — rank (callLLM returns string)
      .mockResolvedValueOnce(JSON.stringify(rankedResults))

    // Step 3 — web search (callLLMMultimodal returns {text, response})
    mockCallLLMMultimodal.mockResolvedValueOnce({
      text: JSON.stringify(sampleSearchResults),
      response: { content: [{ type: 'text', text: JSON.stringify(sampleSearchResults) }] },
    })

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'easy chicken stir fry' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.results.length).toBeGreaterThan(0)
  })

  it('returns empty results array when web search returns nothing', async () => {
    setupMocks()

    // Step 2 — query gen
    mockCallLLM.mockResolvedValueOnce('["query one"]')

    // Step 3 — web search returns empty
    mockCallLLMMultimodal.mockResolvedValueOnce({
      text: '[]',
      response: { content: [{ type: 'text', text: '[]' }] },
    })

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'exotic dish no results' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toEqual([])
  })
})

describe('POST /api/discover — T05: suggestedTags filtered to FIRST_CLASS_TAGS', () => {
  beforeEach(() => { vi.resetModules() })

  it('strips tags not in FIRST_CLASS_TAGS from results', async () => {
    setupMocks()

    const resultsWithBadTags = [
      {
        url: 'https://example.com/recipe',
        title: 'Test Recipe',
        siteName: 'example.com',
        description: null,
        suggestedTags: ['Chicken', 'NotATag', 'FakeCategory', 'Quick'],
      },
    ]

    mockCallLLM
      .mockResolvedValueOnce('["test query"]')
      .mockResolvedValueOnce(JSON.stringify(resultsWithBadTags))

    mockCallLLMMultimodal.mockResolvedValueOnce({
      text: JSON.stringify([resultsWithBadTags[0]]),
      response: { content: [{ type: 'text', text: JSON.stringify([resultsWithBadTags[0]]) }] },
    })

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'test recipe' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results.length).toBeGreaterThan(0)
    const tags: string[] = body.results[0].suggestedTags
    expect(tags).toContain('Chicken')
    expect(tags).toContain('Quick')
    expect(tags).not.toContain('NotATag')
    expect(tags).not.toContain('FakeCategory')
  })
})

describe('POST /api/discover — T06: vaultMatch populated when similar recipe in vault', () => {
  beforeEach(() => { vi.resetModules() })

  it('includes vaultMatch in result when LLM identifies a match', async () => {
    setupMocks()

    const resultsWithMatch = [
      {
        url: 'https://budgetbytes.com/recipes/chicken-stir-fry',
        title: 'Easy Chicken Stir Fry',
        siteName: 'budgetbytes.com',
        description: 'Quick dinner.',
        suggestedTags: ['Chicken'],
        vaultMatch: {
          similarRecipeTitle: 'Chicken Stir Fry',
          similarity: 'similar',
        },
      },
    ]

    mockCallLLM
      .mockResolvedValueOnce('["chicken stir fry recipe"]')
      .mockResolvedValueOnce(JSON.stringify(resultsWithMatch))

    mockCallLLMMultimodal.mockResolvedValueOnce({
      text: JSON.stringify([sampleSearchResults[0]]),
      response: { content: [{ type: 'text', text: JSON.stringify([sampleSearchResults[0]]) }] },
    })

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'chicken stir fry' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const body = await res.json()
    const result = body.results[0]
    expect(result.vaultMatch).toBeDefined()
    expect(result.vaultMatch.similarity).toBe('similar')
    expect(result.vaultMatch.similarRecipeTitle).toBe('Chicken Stir Fry')
  })
})

describe('POST /api/discover — T07: siteFilter appends site: operator', () => {
  beforeEach(() => { vi.resetModules() })

  it('includes site: operator in search query when siteFilter is set', async () => {
    setupMocks()

    mockCallLLM
      .mockResolvedValueOnce('["chicken stir fry site:budgetbytes.com"]')
      .mockResolvedValueOnce(JSON.stringify(rankedResults))

    mockCallLLMMultimodal.mockResolvedValueOnce({
      text: JSON.stringify(sampleSearchResults),
      response: { content: [{ type: 'text', text: JSON.stringify(sampleSearchResults) }] },
    })

    const { POST } = await import('../route')
    const res = await POST(
      makeReq({ query: 'chicken stir fry', siteFilter: 'budgetbytes.com' }) as Parameters<typeof POST>[0]
    )
    expect(res.status).toBe(200)

    // The query-gen call (first callLLM) should include site filter instruction
    const firstCall = mockCallLLM.mock.calls[0]![0]
    expect(firstCall.user).toContain('site:budgetbytes.com')
  })
})

describe('POST /api/discover — auth', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 401 when not authenticated', async () => {
    setupUnauthMocks()

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'test' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(401)
  })
})
