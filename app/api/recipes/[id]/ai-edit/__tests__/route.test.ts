/**
 * Tests for POST /api/recipes/[id]/ai-edit
 * Covers spec-18 test cases: T06 (server side), T07, T20
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }

const mockLLMState = {
  response: JSON.stringify({
    message: 'Done — I substituted black beans for chickpeas.',
    changes: ['Replaced chickpeas with black beans'],
    title: 'Roast Chicken',
    ingredients: '1 whole chicken\n2 cans black beans',
    steps: 'Roast the chicken.\nServe with beans.',
    notes: null,
    servings: 4,
  }),
  shouldThrow: false,
}

vi.mock('@/lib/llm', () => ({
  callLLMMultimodal: vi.fn().mockImplementation(async () => {
    if (mockLLMState.shouldThrow) throw new Error('LLM error')
    return mockLLMState.response
  }),
  parseLLMJson: vi.fn().mockImplementation(<T>(text: string): T => JSON.parse(text) as T),
  LLMError: class LLMError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  },
  LLM_MODEL_CAPABLE: 'claude-sonnet-4-6',
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: async () => null,
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
}))

import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { checkOwnership } from '@/lib/household'

function makeAuthMock() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    },
    from: vi.fn(),
  }
}

function makeReq(body: unknown, recipeId = 'recipe-1'): Request {
  return new Request(`http://localhost/api/recipes/${recipeId}/ai-edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  message: 'no chickpeas please',
  current_recipe: {
    title: 'Roast Chicken',
    ingredients: '1 whole chicken\n2 cans chickpeas',
    steps: 'Roast the chicken.\nServe with chickpeas.',
    notes: null,
    servings: 4,
  },
  conversation_history: [],
}

beforeEach(() => {
  vi.mocked(checkOwnership).mockResolvedValue({ owned: true })
  mockLLMState.shouldThrow = false
  mockLLMState.response = JSON.stringify({
    message: 'Done — I substituted black beans for chickpeas.',
    changes: ['Replaced chickpeas with black beans'],
    title: 'Roast Chicken',
    ingredients: '1 whole chicken\n2 cans black beans',
    steps: 'Roast the chicken.\nServe with beans.',
    notes: null,
    servings: 4,
  })
})

// T06 (server side): Happy path returns { message, recipe, changes }
describe('T06 - POST /api/recipes/[id]/ai-edit happy path', () => {
  it('returns 200 with correct shape', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(
      makeReq(validBody) as Parameters<typeof POST>[0],
      { params: { id: 'recipe-1' } },
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.message).toBe('Done — I substituted black beans for chickpeas.')
    expect(json.recipe.title).toBe('Roast Chicken')
    expect(json.recipe.ingredients).toBe('1 whole chicken\n2 cans black beans')
    expect(json.recipe.steps).toBe('Roast the chicken.\nServe with beans.')
    expect(json.recipe.notes).toBeNull()
    expect(json.recipe.servings).toBe(4)
    expect(json.changes).toEqual(['Replaced chickpeas with black beans'])
  })
})

// T07: Returns 403 when user does not own the recipe
describe('T07 - POST /api/recipes/[id]/ai-edit returns 403 for non-owner', () => {
  it('returns 403 when checkOwnership returns owned: false', async () => {
    vi.mocked(checkOwnership).mockResolvedValue({ owned: false, status: 403 })
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(
      makeReq(validBody) as Parameters<typeof POST>[0],
      { params: { id: 'recipe-1' } },
    )

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('Forbidden')
  })
})

// T20: Returns 400 for empty message
describe('T20 - POST /api/recipes/[id]/ai-edit returns 400 for empty message', () => {
  it('returns 400 when message is empty string', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(
      makeReq({ ...validBody, message: '' }) as Parameters<typeof POST>[0],
      { params: { id: 'recipe-1' } },
    )

    expect(res.status).toBe(400)
  })

  it('returns 400 when message is missing', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createAdminClient>)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { message: _msg, ...bodyWithoutMessage } = validBody
    const { POST } = await import('../route')
    const res = await POST(
      makeReq(bodyWithoutMessage) as Parameters<typeof POST>[0],
      { params: { id: 'recipe-1' } },
    )

    expect(res.status).toBe(400)
  })
})
