/**
 * Tests for POST /api/recipes/search
 * Covers spec test cases: T15 (search returns relevant results), T16 (filters applied),
 * T18 (empty results), security (unknown IDs dropped), 401 for unauthenticated requests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

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
    from: vi.fn((table: string) => {
      if (table === 'recipes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: recipes, error: null }),
          }),
        }
      }
      if (table === 'recipe_history') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: history, error: null }),
          }),
        }
      }
      return {}
    }),
  }
}

// ── LLM mock ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/llm', () => ({
  anthropic: {
    messages: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

import { createServerClient } from '@/lib/supabase-server'
import { anthropic } from '@/lib/llm'

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

  it('returns 401 for unauthenticated request', async () => {
    const mock = makeSupabaseMock({ user: null })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)

    const { POST } = await import('../route')
    const req = makeReq({ query: 'chicken' }, { Authorization: '' })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(401)
  })

  it('T18: returns empty results when LLM returns []', async () => {
    const mock = makeSupabaseMock({})
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: '[]' }],
    } as Awaited<ReturnType<typeof anthropic.messages.create>>)

    const { POST } = await import('../route')
    const req = makeReq({ query: 'xyzzy nothing matches' })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toEqual([])
  })

  it('T15: returns relevant results ordered by LLM rank', async () => {
    const mock = makeSupabaseMock({})
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: '["recipe-1","recipe-3"]' }],
    } as Awaited<ReturnType<typeof anthropic.messages.create>>)

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
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: '["recipe-1","evil-injected-uuid"]' }],
    } as Awaited<ReturnType<typeof anthropic.messages.create>>)

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
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    // LLM ranks all three; filters should remove the slow recipes
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: '["recipe-1","recipe-2","recipe-3"]' }],
    } as Awaited<ReturnType<typeof anthropic.messages.create>>)

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
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)

    const { POST } = await import('../route')
    const req = makeReq({ query: '   ' })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.results).toEqual([])
  })
})
