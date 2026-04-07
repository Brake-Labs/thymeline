/**
 * Tests for spec-22 cohesive AI context in POST /api/recipes/[id]/ai-edit
 * Covers: T14–T17
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultMockState, defaultGetSession, makeRequest, mockHousehold } from '@/test/helpers'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockState = defaultMockState()

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

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => mockChain([])),
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

vi.mock('@/lib/household', () => ({
  ...mockHousehold(),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true, status: 200 }),
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

import { deriveTasteProfile } from '@/lib/taste-profile'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setupAuth() {
  const { auth } = await import('@/lib/auth-server')
  vi.mocked(auth.api.getSession).mockImplementation(defaultGetSession(mockState))
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
  beforeEach(async () => {
    vi.resetModules()
    mockCallLLMMultimodal.mockClear()
    vi.mocked(deriveTasteProfile).mockResolvedValue(defaultProfile)
    await setupAuth()
  })

  it('T14: calls deriveTasteProfile in the ai-edit route', async () => {
    mockCallLLMMultimodal.mockResolvedValue(sampleEditResponse)

    const { POST } = await import('@/app/api/recipes/[id]/ai-edit/route')
    await POST(makeRequest('POST', 'http://localhost/api/recipes/r1/ai-edit', validBody), { params: { id: 'r1' } })

    expect(deriveTasteProfile).toHaveBeenCalledWith('user-1', null, null)
  })

  it('T15: system prompt includes meal_context and top_tags when profile is non-empty', async () => {
    mockCallLLMMultimodal.mockResolvedValue(sampleEditResponse)

    const { POST } = await import('@/app/api/recipes/[id]/ai-edit/route')
    await POST(makeRequest('POST', 'http://localhost/api/recipes/r1/ai-edit', validBody), { params: { id: 'r1' } })

    const callArgs = mockCallLLMMultimodal.mock.calls[0]![0]
    expect(callArgs.system).toContain('Family with young kids')
    expect(callArgs.system).toContain('Quick')
    expect(callArgs.system).toContain('Asian')
  })

  it('T16: system prompt does not include loved_recipe_ids or disliked_recipe_ids', async () => {
    vi.mocked(deriveTasteProfile).mockResolvedValue({
      ...defaultProfile,
      loved_recipe_ids:    ['recipe-abc'],
      disliked_recipe_ids: ['recipe-xyz'],
    })

    mockCallLLMMultimodal.mockResolvedValue(sampleEditResponse)

    const { POST } = await import('@/app/api/recipes/[id]/ai-edit/route')
    await POST(makeRequest('POST', 'http://localhost/api/recipes/r1/ai-edit', validBody), { params: { id: 'r1' } })

    const callArgs = mockCallLLMMultimodal.mock.calls[0]![0]
    expect(callArgs.system).not.toContain('recipe-abc')
    expect(callArgs.system).not.toContain('recipe-xyz')
    expect(callArgs.system).not.toContain('loved_recipe')
    expect(callArgs.system).not.toContain('disliked_recipe')
  })

  it('T17: no waste badge is added to the ai-edit response', async () => {
    mockCallLLMMultimodal.mockResolvedValue(sampleEditResponse)

    const { POST } = await import('@/app/api/recipes/[id]/ai-edit/route')
    const res = await POST(makeRequest('POST', 'http://localhost/api/recipes/r1/ai-edit', validBody), { params: { id: 'r1' } })
    const body = await res.json()

    expect(body.waste_badge_text).toBeUndefined()
    expect(body.waste_matches).toBeUndefined()
  })

  it('T18: empty taste profile — route succeeds without errors', async () => {
    vi.mocked(deriveTasteProfile).mockResolvedValue({
      ...defaultProfile,
      top_tags:    [],
      meal_context: null,
    })

    mockCallLLMMultimodal.mockResolvedValue(sampleEditResponse)

    const { POST } = await import('@/app/api/recipes/[id]/ai-edit/route')
    const res = await POST(makeRequest('POST', 'http://localhost/api/recipes/r1/ai-edit', validBody), { params: { id: 'r1' } })

    expect(res.status).toBe(200)
    const callArgs = mockCallLLMMultimodal.mock.calls[0]![0]
    expect(callArgs.system).not.toContain('HOUSEHOLD CONTEXT')
  })
})
