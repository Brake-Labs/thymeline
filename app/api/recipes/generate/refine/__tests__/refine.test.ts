/**
 * Tests for POST /api/recipes/generate/refine.
 * Covers spec-25 test cases: T05, T06, T07, T08, T15, T23
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultMockState, defaultGetSession, makeRequest, mockHousehold } from '@/test/helpers'

const mockState = defaultMockState()

const mockLLMState = {
  response: JSON.stringify({
    message: 'I swapped heavy cream for coconut milk.',
    changes: ['Replaced heavy cream with coconut milk'],
    title: 'Dairy-Free Pasta',
    ingredients: 'pasta\ncoconut milk\ngarlic',
    steps: 'Cook pasta\nMix with coconut milk',
    tags: ['Quick', 'Healthy'],
    category: 'main_dish',
    servings: 4,
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    totalTimeMinutes: 30,
    inactiveTimeMinutes: null,
    notes: null,
  }),
  shouldThrow: false,
}

vi.mock('@/lib/llm', () => ({
  callLLMMultimodal: vi.fn().mockImplementation(async () => {
    if (mockLLMState.shouldThrow) throw new Error('LLM error')
    return mockLLMState.response
  }),
  classifyLLMError: (err: unknown) => ({
    code: 'unknown',
    message: err instanceof Error ? err.message : 'LLM error',
  }),
  parseLLMJson: <T,>(text: string): T => JSON.parse(text) as T,
  LLM_MODEL_CAPABLE: 'claude-sonnet-4-6',
}))

vi.mock('@/lib/auth-server', () =>
  ({ auth: { api: { getSession: vi.fn(defaultGetSession(mockState)) } } })
)

vi.mock('@/lib/db', () => ({ db: {} }))

vi.mock('@/lib/household', () => mockHousehold())

vi.mock('@/lib/tags', () => ({
  FIRST_CLASS_TAGS: ['Quick', 'Healthy', 'Vegetarian', 'Gluten-Free', 'Comfort'],
}))

const BASE_RECIPE = {
  title:                 'Creamy Pasta',
  ingredients:           'pasta\nheavy cream\ngarlic',
  steps:                 'Cook pasta\nMix with cream',
  tags:                  ['Quick'],
  category:              'main_dish',
  servings:              4,
  prep_time_minutes:     10,
  cook_time_minutes:     20,
  total_time_minutes:    30,
  inactive_time_minutes: null,
  notes:                 null,
}

const BASE_CONTEXT = {
  meal_type:            'dinner',
  style_hints:          'Italian',
  dietary_restrictions: [],
}

const { POST } = await import('../route')

beforeEach(() => {
  mockState.user = { id: 'user-1', email: 'test@example.com', name: 'Test User', image: null }
  mockLLMState.shouldThrow = false
  mockLLMState.response = JSON.stringify({
    message: 'I swapped heavy cream for coconut milk.',
    changes: ['Replaced heavy cream with coconut milk'],
    title: 'Dairy-Free Pasta',
    ingredients: 'pasta\ncoconut milk\ngarlic',
    steps: 'Cook pasta\nMix with coconut milk',
    tags: ['Quick', 'Healthy'],
    category: 'main_dish',
    servings: 4,
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    totalTimeMinutes: 30,
    inactiveTimeMinutes: null,
    notes: null,
  })
})

// ── T05: 400 for empty message ────────────────────────────────────────────────

describe('T05 - 400 for empty message', () => {
  it('returns 400 when message is empty string', async () => {
    const req = makeRequest('POST', 'http://localhost/api/recipes/generate/refine', {
      message:              '',
      current_recipe:       BASE_RECIPE,
      conversation_history: [],
      generation_context:   BASE_CONTEXT,
    })
    const res = await POST(req, { params: {} })
    expect(res.status).toBe(400)
  })

  it('returns 400 when message is whitespace-only', async () => {
    const req = makeRequest('POST', 'http://localhost/api/recipes/generate/refine', {
      message:              '   ',
      current_recipe:       BASE_RECIPE,
      conversation_history: [],
      generation_context:   BASE_CONTEXT,
    })
    const res = await POST(req, { params: {} })
    expect(res.status).toBe(400)
  })
})

// ── T06: 400 for missing current_recipe.title ─────────────────────────────────

describe('T06 - 400 for missing current_recipe.title', () => {
  it('returns 400 when title is empty string', async () => {
    const req = makeRequest('POST', 'http://localhost/api/recipes/generate/refine', {
      message:              'make it dairy-free',
      current_recipe:       { ...BASE_RECIPE, title: '' },
      conversation_history: [],
      generation_context:   BASE_CONTEXT,
    })
    const res = await POST(req, { params: {} })
    expect(res.status).toBe(400)
  })

  it('returns 400 when current_recipe is missing title field', async () => {
    const { title: _t, ...noTitle } = BASE_RECIPE
    const req = makeRequest('POST', 'http://localhost/api/recipes/generate/refine', {
      message:              'make it dairy-free',
      current_recipe:       noTitle,
      conversation_history: [],
      generation_context:   BASE_CONTEXT,
    })
    const res = await POST(req, { params: {} })
    expect(res.status).toBe(400)
  })
})

// ── T07: 401 for unauthenticated request ──────────────────────────────────────

describe('T07 - 401 for unauthenticated request', () => {
  it('returns 401 when not authenticated', async () => {
    mockState.user = null
    const req = makeRequest('POST', 'http://localhost/api/recipes/generate/refine', {
      message:              'make it dairy-free',
      current_recipe:       BASE_RECIPE,
      conversation_history: [],
      generation_context:   BASE_CONTEXT,
    })
    const res = await POST(req, { params: {} })
    expect(res.status).toBe(401)
  })
})

// ── T08: 500 on LLM failure ───────────────────────────────────────────────────

describe('T08 - 500 on LLM failure', () => {
  it('returns 500 when LLM throws', async () => {
    mockLLMState.shouldThrow = true
    const req = makeRequest('POST', 'http://localhost/api/recipes/generate/refine', {
      message:              'make it dairy-free',
      current_recipe:       BASE_RECIPE,
      conversation_history: [],
      generation_context:   BASE_CONTEXT,
    })
    const res = await POST(req, { params: {} })
    expect(res.status).toBe(500)
  })
})

// ── T15: Multi-turn context — second turn sends full conversation_history ──────

describe('T15 - Multi-turn context', () => {
  it('succeeds on first refinement turn (empty conversation_history)', async () => {
    const req = makeRequest('POST', 'http://localhost/api/recipes/generate/refine', {
      message:              'make it dairy-free',
      current_recipe:       BASE_RECIPE,
      conversation_history: [],
      generation_context:   BASE_CONTEXT,
    })
    const res = await POST(req, { params: {} })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recipe).toBeDefined()
    expect(body.message).toBeDefined()
    expect(body.changes).toBeDefined()
  })

  it('succeeds on subsequent turns with populated conversation_history', async () => {
    const req = makeRequest('POST', 'http://localhost/api/recipes/generate/refine', {
      message:              'now cut the servings to 2',
      current_recipe:       { ...BASE_RECIPE, title: 'Dairy-Free Pasta', ingredients: 'pasta\ncoconut milk\ngarlic' },
      conversation_history: [
        { role: 'user',      content: 'make it dairy-free' },
        { role: 'assistant', content: 'I swapped heavy cream for coconut milk.' },
      ],
      generation_context: BASE_CONTEXT,
    })
    const res = await POST(req, { params: {} })
    expect(res.status).toBe(200)
  })
})

// ── T23: Tags filtered to FIRST_CLASS_TAGS ────────────────────────────────────

describe('T23 - Tags filtered to FIRST_CLASS_TAGS', () => {
  it('strips tags not in FIRST_CLASS_TAGS from the response', async () => {
    mockLLMState.response = JSON.stringify({
      message:              'Updated.',
      changes:              [],
      title:                'Test',
      ingredients:          'pasta',
      steps:                'Cook',
      tags:                 ['Quick', 'Unknown-Tag', 'InventedTag'],
      category:             'main_dish',
      servings:             2,
      prepTimeMinutes:      5,
      cookTimeMinutes:      10,
      totalTimeMinutes:     15,
      inactiveTimeMinutes:  null,
      notes:                null,
    })
    const req = makeRequest('POST', 'http://localhost/api/recipes/generate/refine', {
      message:              'make it quick',
      current_recipe:       BASE_RECIPE,
      conversation_history: [],
      generation_context:   BASE_CONTEXT,
    })
    const res = await POST(req, { params: {} })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recipe.tags).toEqual(['Quick'])
    expect(body.recipe.tags).not.toContain('Unknown-Tag')
    expect(body.recipe.tags).not.toContain('InventedTag')
  })

  it('returns empty tags array when LLM returns no valid tags', async () => {
    mockLLMState.response = JSON.stringify({
      message:   'Updated.',
      changes:   [],
      title:     'Test',
      ingredients: 'pasta',
      steps:     'Cook',
      tags:      ['Fake', 'NotReal'],
      category:  'main_dish',
      servings:  null,
      prepTimeMinutes:     null,
      cookTimeMinutes:     null,
      totalTimeMinutes:    null,
      inactiveTimeMinutes: null,
      notes:     null,
    })
    const req = makeRequest('POST', 'http://localhost/api/recipes/generate/refine', {
      message:              'simplify it',
      current_recipe:       BASE_RECIPE,
      conversation_history: [],
      generation_context:   BASE_CONTEXT,
    })
    const res = await POST(req, { params: {} })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recipe.tags).toEqual([])
  })
})
