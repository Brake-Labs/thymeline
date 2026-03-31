/**
 * Tests for POST /api/pantry/match.
 * Covers spec-12 test cases: T15, T16
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tableMockWithChain } from '@/test/helpers'

const mockUser = { id: 'user-1' }

const samplePantryItems = [
  { name: 'chicken breast' },
  { name: 'spinach' },
  { name: 'garlic' },
]

const sampleRecipes = [
  { id: 'r1', title: 'Chicken Stir Fry', ingredients: 'chicken breast\nspinach\ngarlic\nsoy sauce', tags: [] },
  { id: 'r2', title: 'Pasta', ingredients: 'pasta\ncream\nparmesan', tags: [] },
]

// Module-level mock state for LLM responses
const mockMatchState = {
  llmResponse: '{ "matches": [] }',
  shouldThrow:  false,
}

vi.mock('@/lib/llm', () => ({
  callLLM: vi.fn().mockImplementation(async () => {
    if (mockMatchState.shouldThrow) throw new Error('LLM error')
    return mockMatchState.llmResponse
  }),
  classifyLLMError: (err: unknown) => err,
  parseLLMJson: (text: string) => JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()),
  LLM_MODEL_CAPABLE: 'claude-sonnet-4-6',
}))

function makeDbMock(opts: {
  pantryItems?: unknown[]
  recipes?:     unknown[]
} = {}) {
  const { pantryItems = samplePantryItems, recipes = sampleRecipes } = opts

  return {
    from: tableMockWithChain({
      pantry_items: { select: { data: pantryItems } },
      recipes: { select: { data: recipes } },
    }),
  }
}

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient:  vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: async () => null,
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
  scopeQuery: (query: any, userId: string) => query.eq('user_id', userId),
}))

import { createServerClient, createAdminClient } from '@/lib/supabase-server'

function makeAuthMock() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    },
  }
}

function makeReq(body?: unknown): Request {
  return new Request('http://localhost/api/pantry/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── T15: POST /api/pantry/match returns ranked matches ───────────────────────

describe('T15 - POST /api/pantry/match returns ranked matches', () => {
  beforeEach(() => {
    vi.resetModules()
    mockMatchState.shouldThrow = false
    mockMatchState.llmResponse = JSON.stringify({
      matches: [
        { recipe_id: 'r1', recipe_title: 'Chicken Stir Fry', match_count: 3, matched_items: ['chicken breast', 'spinach', 'garlic'] },
      ],
    })
  })

  it('returns matches array from LLM response', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeDbMock() as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../match/route')
    const res = await POST(makeReq({}) as Parameters<typeof POST>[0])

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.matches)).toBe(true)
    expect(json.matches.length).toBeGreaterThan(0)
    expect(json.matches[0].recipe_id).toBe('r1')
  })
})

// ── T16: POST /api/pantry/match returns empty array gracefully ────────────────

describe('T16 - POST /api/pantry/match returns empty array gracefully', () => {
  beforeEach(() => {
    vi.resetModules()
    mockMatchState.shouldThrow = false
    mockMatchState.llmResponse = '{ "matches": [] }'
  })

  it('returns { matches: [] } when LLM returns invalid JSON', async () => {
    mockMatchState.llmResponse = 'not valid json {{{'
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeDbMock() as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../match/route')
    const res = await POST(makeReq({}) as Parameters<typeof POST>[0])

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.matches).toEqual([])
  })

  it('returns { matches: [] } when pantry is empty', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeDbMock({ pantryItems: [] }) as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../match/route')
    const res = await POST(makeReq({}) as Parameters<typeof POST>[0])

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.matches).toEqual([])
  })
})
