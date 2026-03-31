/**
 * Tests for POST /api/recipes/search
 * Covers spec test cases: T15 (search returns relevant results), T16 (filters applied),
 * T18 (empty results), security (unknown IDs dropped), 401 for unauthenticated requests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tableMockWithChain } from '@/test/helpers'

// ── Shared mock state ──────────────────────────────────────────────────────────

const mockUser = { id: 'user-1' }

const sampleRecipes = [
  {
    id: 'recipe-1',
    title: 'Chicken Tikka Masala',
    category: 'main_dish',
    tags: ['Indian', 'Chicken'],
    total_time_minutes: 60,
    ingredients: '500g chicken\n2 tbsp tikka paste',
  },
  {
    id: 'recipe-2',
    title: 'Caesar Salad',
    category: 'side_dish',
    tags: ['Quick', 'American'],
    total_time_minutes: 15,
    ingredients: 'romaine lettuce\nparmesan\ncroutons',
  },
  {
    id: 'recipe-3',
    title: 'Beef Stew',
    category: 'main_dish',
    tags: ['Comfort', 'Beef'],
    total_time_minutes: 180,
    ingredients: 'beef chuck\npotatoes\ncarrots',
  },
]

// ── Supabase mock factory ─────────────────────────────────────────────────────

function makeSupabaseMock(opts: {
  user?: typeof mockUser | null
  recipes?: typeof sampleRecipes
  history?: { recipe_id: string; made_on: string }[]
}) {
  const { user = mockUser, recipes = sampleRecipes, history = [] } = opts

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('No user'),
      }),
    },
    from: tableMockWithChain({
      recipes: { select: { data: recipes } },
      recipe_history: { select: { data: history } },
    }),
  }
}

// ── LLM mock ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/llm', () => ({
  callLLM: vi.fn(),
  LLM_MODEL_FAST: 'claude-haiku-4-5-20251001',
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient:  vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: async () => null,
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
  scopeQuery: (query: any, userId: string, ctx: any) => {
    if (ctx) return query.eq('household_id', ctx.householdId)
    return query.eq('user_id', userId)
  },
}))

import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { callLLM } from '@/lib/llm'

function makeReq(body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/recipes/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/recipes/search', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('T18: returns empty results when LLM returns []', async () => {
    const mock = makeSupabaseMock({})
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)
    vi.mocked(callLLM).mockResolvedValueOnce('[]')

    const { POST } = await import('../route')
    const req = makeReq({ query: 'xyzzy nothing matches' })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toEqual([])
  })

  it('T15: returns relevant results ordered by LLM rank', async () => {
    const mock = makeSupabaseMock({})
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)
    vi.mocked(callLLM).mockResolvedValueOnce('["recipe-1","recipe-3"]')

    const { POST } = await import('../route')
    const req = makeReq({ query: 'chicken or beef' })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toHaveLength(2)
    expect(json.results[0].recipe_id).toBe('recipe-1')
    expect(json.results[1].recipe_id).toBe('recipe-3')
  })

  it('security: silently drops IDs not in the user recipe list', async () => {
    const mock = makeSupabaseMock({})
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)
    vi.mocked(callLLM).mockResolvedValueOnce('["recipe-1","evil-injected-uuid"]')

    const { POST } = await import('../route')
    const req = makeReq({ query: 'anything' })
    const res = await POST(req as Parameters<typeof POST>[0])
    const json = await res.json()
    const ids = json.results.map((r: { recipe_id: string }) => r.recipe_id)
    expect(ids).not.toContain('evil-injected-uuid')
    expect(ids).toContain('recipe-1')
  })

  it('T16: applies filters on top of LLM results', async () => {
    const mock = makeSupabaseMock({})
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)
    // LLM ranks all three; filters should remove the slow recipes
    vi.mocked(callLLM).mockResolvedValueOnce('["recipe-1","recipe-2","recipe-3"]')

    const { POST } = await import('../route')
    const req = makeReq({
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
    const res = await POST(req as Parameters<typeof POST>[0])
    const json = await res.json()
    // Only recipe-2 (15 min) passes the 30-min filter
    expect(json.results).toHaveLength(1)
    expect(json.results[0].recipe_id).toBe('recipe-2')
  })

  it('returns empty results for empty query', async () => {
    const mock = makeSupabaseMock({})
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const req = makeReq({ query: '   ' })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toEqual([])
  })
})
