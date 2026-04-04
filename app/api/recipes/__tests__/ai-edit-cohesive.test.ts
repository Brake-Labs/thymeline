/**
 * Tests for spec-22 cohesive AI context in POST /api/recipes/[id]/ai-edit
 * Covers: T14–T17
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient:  vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checkOwnership: vi.fn().mockResolvedValue({ owned: true, status: 200 }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scopeQuery: (query: any, userId: string, ctx: any) => {
    if (ctx) return query.eq('household_id', ctx.householdId)
    return query.eq('user_id', userId)
  },
}))

const mockCallLLMMultimodal = vi.fn()
vi.mock('@/lib/llm', () => ({
  callLLMMultimodal: (...args: unknown[]) => mockCallLLMMultimodal(...args),
  parseLLMJson: (text: string) => JSON.parse(text),
  LLMError: class LLMError extends Error {},
  LLM_MODEL_CAPABLE: 'claude-sonnet-4-6',
}))

vi.mock('@/lib/taste-profile', () => ({
  deriveTasteProfile: vi.fn(),
}))

import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { deriveTasteProfile } from '@/lib/taste-profile'
import { NextRequest } from 'next/server'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSupabaseMock() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    from: vi.fn(() => ({})),
  }
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/recipes/r1/ai-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  message: 'Make it spicier',
  current_recipe: {
    title:       'Chicken Stir Fry',
    ingredients: '500g chicken\n2 tbsp soy sauce',
    steps:       '1. Cook chicken\n2. Add sauce',
    notes:       null,
    servings:    4,
  },
  conversation_history: [],
}

const sampleEditResponse = JSON.stringify({
  message:     'Added chili flakes for extra heat.',
  changes:     ['Added 1 tsp chili flakes'],
  title:       'Chicken Stir Fry',
  ingredients: '500g chicken\n2 tbsp soy sauce\n1 tsp chili flakes',
  steps:       '1. Cook chicken\n2. Add sauce\n3. Sprinkle chili flakes',
  notes:       null,
  servings:    4,
})

const defaultProfile = {
  loved_recipe_ids:    [],
  disliked_recipe_ids: [],
  top_tags:            ['Quick', 'Asian'],
  avoided_tags:        [],
  preferred_tags:      ['Quick'],
  meal_context:        'Family with young kids',
  cooking_frequency:   'moderate' as const,
  recent_recipes:      [],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/recipes/[id]/ai-edit — spec-22 taste profile (T14–T17)', () => {
  beforeEach(() => {
    vi.resetModules()
    mockCallLLMMultimodal.mockClear()
    vi.mocked(deriveTasteProfile).mockResolvedValue(defaultProfile)
  })

  it('T14: calls deriveTasteProfile in the ai-edit route', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)
    mockCallLLMMultimodal.mockResolvedValue(sampleEditResponse)

    const { POST } = await import('@/app/api/recipes/[id]/ai-edit/route')
    await POST(makeReq(validBody), { params: { id: 'r1' } })

    expect(deriveTasteProfile).toHaveBeenCalledWith('user-1', expect.anything(), null)
  })

  it('T15: system prompt includes meal_context and top_tags when profile is non-empty', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)
    mockCallLLMMultimodal.mockResolvedValue(sampleEditResponse)

    const { POST } = await import('@/app/api/recipes/[id]/ai-edit/route')
    await POST(makeReq(validBody), { params: { id: 'r1' } })

    const callArgs = mockCallLLMMultimodal.mock.calls[0]![0]
    expect(callArgs.system).toContain('Family with young kids')
    expect(callArgs.system).toContain('Quick')
    expect(callArgs.system).toContain('Asian')
  })

  it('T16: system prompt does not include loved_recipe_ids or disliked_recipe_ids', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.mocked(deriveTasteProfile).mockResolvedValue({
      ...defaultProfile,
      loved_recipe_ids:    ['recipe-abc'],
      disliked_recipe_ids: ['recipe-xyz'],
    })

    mockCallLLMMultimodal.mockResolvedValue(sampleEditResponse)

    const { POST } = await import('@/app/api/recipes/[id]/ai-edit/route')
    await POST(makeReq(validBody), { params: { id: 'r1' } })

    const callArgs = mockCallLLMMultimodal.mock.calls[0]![0]
    expect(callArgs.system).not.toContain('recipe-abc')
    expect(callArgs.system).not.toContain('recipe-xyz')
    expect(callArgs.system).not.toContain('loved_recipe')
    expect(callArgs.system).not.toContain('disliked_recipe')
  })

  it('T17: no waste badge is added to the ai-edit response', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)
    mockCallLLMMultimodal.mockResolvedValue(sampleEditResponse)

    const { POST } = await import('@/app/api/recipes/[id]/ai-edit/route')
    const res = await POST(makeReq(validBody), { params: { id: 'r1' } })
    const body = await res.json()

    expect(body.waste_badge_text).toBeUndefined()
    expect(body.waste_matches).toBeUndefined()
  })

  it('T18: empty taste profile — route succeeds without errors', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.mocked(deriveTasteProfile).mockResolvedValue({
      ...defaultProfile,
      top_tags:    [],
      meal_context: null,
    })

    mockCallLLMMultimodal.mockResolvedValue(sampleEditResponse)

    const { POST } = await import('@/app/api/recipes/[id]/ai-edit/route')
    const res = await POST(makeReq(validBody), { params: { id: 'r1' } })

    expect(res.status).toBe(200)
    const callArgs = mockCallLLMMultimodal.mock.calls[0]![0]
    // System prompt should not contain HOUSEHOLD CONTEXT when profile is empty
    expect(callArgs.system).not.toContain('HOUSEHOLD CONTEXT')
  })
})
