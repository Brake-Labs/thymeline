/**
 * Tests for POST /api/discover
 * Covers spec-16 test cases: T03, T04, T05, T06, T07
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock ──────────────────────────────────────────────────────────────

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

const mockAnthropicCreate = vi.fn()
vi.mock('@/lib/llm', () => ({
  anthropic: {
    messages: {
      create: (...args: unknown[]) => mockAnthropicCreate(...args),
    },
  },
  // parseLLMJson: strip markdown fences and parse JSON (mirrors the real implementation)
  parseLLMJson: (text: string) => {
    const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
    return JSON.parse(stripped)
  },
  LLM_MODEL_CAPABLE: 'claude-sonnet-4-6',
}))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth-server'

beforeEach(() => {
  mockAnthropicCreate.mockClear()
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

function makeTextMsg(text: string) {
  return { content: [{ type: 'text', text }] }
}

const sampleSearchResults = [
  {
    url: 'https://budgetbytes.com/recipes/chicken-stir-fry',
    title: 'Easy Chicken Stir Fry',
    site_name: 'budgetbytes.com',
    description: 'A quick weeknight dinner.',
  },
  {
    url: 'https://seriouseats.com/beef-stew-recipe',
    title: 'Classic Beef Stew',
    site_name: 'seriouseats.com',
    description: 'Rich and hearty.',
  },
]

const rankedResults = [
  {
    url: 'https://budgetbytes.com/recipes/chicken-stir-fry',
    title: 'Easy Chicken Stir Fry',
    site_name: 'budgetbytes.com',
    description: 'A quick weeknight dinner.',
    suggested_tags: ['Chicken', 'Quick'],
    vault_match: {
      similar_recipe_title: 'Chicken Stir Fry',
      similarity: 'similar',
    },
  },
  {
    url: 'https://seriouseats.com/beef-stew-recipe',
    title: 'Classic Beef Stew',
    site_name: 'seriouseats.com',
    description: 'Rich and hearty.',
    suggested_tags: ['Beef', 'Comfort'],
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
    expect(body.error).toBe('Query is required')
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

    // Step 2 — query gen
    mockAnthropicCreate
      .mockResolvedValueOnce(makeTextMsg('["easy chicken stir fry recipe", "quick chicken stir fry weeknight"]'))
      // Step 3 — web search
      .mockResolvedValueOnce(makeTextMsg(JSON.stringify(sampleSearchResults)))
      // Step 4 — rank
      .mockResolvedValueOnce(makeTextMsg(JSON.stringify(rankedResults)))

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'easy chicken stir fry' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.results.length).toBeGreaterThan(0)
  })

  it('returns empty results array when web search returns nothing', async () => {
    setupMocks()

    mockAnthropicCreate
      .mockResolvedValueOnce(makeTextMsg('["query one"]'))
      .mockResolvedValueOnce(makeTextMsg('[]'))

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'exotic dish no results' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toEqual([])
  })
})

describe('POST /api/discover — T05: suggested_tags filtered to FIRST_CLASS_TAGS', () => {
  beforeEach(() => { vi.resetModules() })

  it('strips tags not in FIRST_CLASS_TAGS from results', async () => {
    setupMocks()

    const resultsWithBadTags = [
      {
        url: 'https://example.com/recipe',
        title: 'Test Recipe',
        site_name: 'example.com',
        description: null,
        suggested_tags: ['Chicken', 'NotATag', 'FakeCategory', 'Quick'],
      },
    ]

    mockAnthropicCreate
      .mockResolvedValueOnce(makeTextMsg('["test query"]'))
      .mockResolvedValueOnce(makeTextMsg(JSON.stringify([resultsWithBadTags[0]])))
      .mockResolvedValueOnce(makeTextMsg(JSON.stringify(resultsWithBadTags)))

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'test recipe' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results.length).toBeGreaterThan(0)
    const tags: string[] = body.results[0].suggested_tags
    expect(tags).toContain('Chicken')
    expect(tags).toContain('Quick')
    expect(tags).not.toContain('NotATag')
    expect(tags).not.toContain('FakeCategory')
  })
})

describe('POST /api/discover — T06: vault_match populated when similar recipe in vault', () => {
  beforeEach(() => { vi.resetModules() })

  it('includes vault_match in result when LLM identifies a match', async () => {
    setupMocks()

    const resultsWithMatch = [
      {
        url: 'https://budgetbytes.com/recipes/chicken-stir-fry',
        title: 'Easy Chicken Stir Fry',
        site_name: 'budgetbytes.com',
        description: 'Quick dinner.',
        suggested_tags: ['Chicken'],
        vault_match: {
          similar_recipe_title: 'Chicken Stir Fry',
          similarity: 'similar',
        },
      },
    ]

    mockAnthropicCreate
      .mockResolvedValueOnce(makeTextMsg('["chicken stir fry recipe"]'))
      .mockResolvedValueOnce(makeTextMsg(JSON.stringify([sampleSearchResults[0]])))
      .mockResolvedValueOnce(makeTextMsg(JSON.stringify(resultsWithMatch)))

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'chicken stir fry' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const body = await res.json()
    const result = body.results[0]
    expect(result.vault_match).toBeDefined()
    expect(result.vault_match.similarity).toBe('similar')
    expect(result.vault_match.similar_recipe_title).toBe('Chicken Stir Fry')
  })
})

describe('POST /api/discover — T07: site_filter appends site: operator', () => {
  beforeEach(() => { vi.resetModules() })

  it('includes site: operator in search query when site_filter is set', async () => {
    setupMocks()

    mockAnthropicCreate
      .mockResolvedValueOnce(makeTextMsg('["chicken stir fry site:budgetbytes.com"]'))
      .mockResolvedValueOnce(makeTextMsg(JSON.stringify(sampleSearchResults)))
      .mockResolvedValueOnce(makeTextMsg(JSON.stringify(rankedResults)))

    const { POST } = await import('../route')
    const res = await POST(
      makeReq({ query: 'chicken stir fry', site_filter: 'budgetbytes.com' }) as Parameters<typeof POST>[0]
    )
    expect(res.status).toBe(200)

    // The query-gen prompt should have included site:budgetbytes.com instruction
    const firstCall = mockAnthropicCreate.mock.calls[0]![0]
    const promptContent: string = firstCall.messages[0].content
    expect(promptContent).toContain('site:budgetbytes.com')
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
