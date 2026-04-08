/**
 * Tests for spec-22 cohesive AI context in POST /api/recipes/generate
 * Covers: T08–T13, T18
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

vi.mock('@/lib/household', () => mockHousehold())

const mockCallLLM = vi.fn()
vi.mock('@/lib/llm', () => ({
  callLLM:           (...args: unknown[]) => mockCallLLM(...args),
  classifyLLMError:  vi.fn((e) => ({ code: 'unknown', message: String(e) })),
  LLM_MODEL_CAPABLE: 'claude-sonnet-4-6',
}))

vi.mock('@/lib/taste-profile', () => ({
  deriveTasteProfile: vi.fn(),
}))

vi.mock('@/lib/waste-overlap', () => ({
  detectWasteOverlap: vi.fn(),
}))

vi.mock('@/lib/plan-utils', () => ({
  fetchCurrentWeekPlan:  vi.fn(),
  getPlanWasteBadgeText: vi.fn((matches) => {
    if (!matches.length) return ''
    if (matches.length >= 2) return `Uses up ${matches.length} ingredients`
    return `Uses up your ${matches[0].ingredient}`
  }),
}))

import { deriveTasteProfile } from '@/lib/taste-profile'
import { detectWasteOverlap } from '@/lib/waste-overlap'
import { fetchCurrentWeekPlan } from '@/lib/plan-utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setupAuth() {
  const { auth } = await import('@/lib/auth-server')
  vi.mocked(auth.api.getSession).mockImplementation(defaultGetSession(mockState))
}

const validBody = {
  specificIngredients: 'chicken, spinach',
  mealType: 'dinner',
  styleHints: '',
  dietaryRestrictions: [],
}

const sampleRecipeJSON = JSON.stringify({
  title:              'Chicken Spinach',
  ingredients:        'chicken breast\nspinach',
  steps:              'Cook chicken. Add spinach.',
  tags:               ['Quick'],
  category:           'main_dish',
  servings:           4,
  prepTimeMinutes:    10,
  cookTimeMinutes:    20,
  totalTimeMinutes:   30,
  inactiveTimeMinutes: null,
  notes:              null,
})

const defaultProfile = {
  lovedRecipeIds:    [],
  dislikedRecipeIds: [],
  topTags:            ['Quick', 'Healthy'],
  avoidedTags:        [],
  preferredTags:      ['Healthy'],
  mealContext:        'Family of 4, quick meals preferred',
  cookingFrequency:   'moderate' as const,
  recentRecipes:      [],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/recipes/generate — spec-22 taste profile (T08–T09)', () => {
  beforeEach(async () => {
    vi.resetModules()
    mockCallLLM.mockClear()
    vi.mocked(deriveTasteProfile).mockResolvedValue(defaultProfile)
    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([])
    vi.mocked(detectWasteOverlap).mockResolvedValue(new Map())
    await setupAuth()
  })

  it('T08: calls deriveTasteProfile in the generate route', async () => {
    mockCallLLM.mockResolvedValue(sampleRecipeJSON)

    const { POST } = await import('@/app/api/recipes/generate/route')
    await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', validBody))

    expect(deriveTasteProfile).toHaveBeenCalledWith('user-1', null, null)
  })

  it('T09: system message includes topTags, mealContext, and cookingFrequency', async () => {
    mockCallLLM.mockResolvedValue(sampleRecipeJSON)

    const { POST } = await import('@/app/api/recipes/generate/route')
    await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', validBody))

    const callArgs = mockCallLLM.mock.calls[0]![0]
    expect(callArgs.system).toContain('Quick')
    expect(callArgs.system).toContain('Healthy')
    expect(callArgs.system).toContain('Family of 4, quick meals preferred')
    expect(callArgs.system).toContain('moderate')
  })

  it('T18: empty taste profile produces no errors', async () => {
    vi.mocked(deriveTasteProfile).mockResolvedValue({
      ...defaultProfile,
      topTags:    [],
      preferredTags: [],
      mealContext: null,
    })

    mockCallLLM.mockResolvedValue(sampleRecipeJSON)

    const { POST } = await import('@/app/api/recipes/generate/route')
    const res = await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', validBody))

    expect(res.status).toBe(200)
  })
})

describe('POST /api/recipes/generate — spec-22 waste detection (T10–T13)', () => {
  beforeEach(async () => {
    vi.resetModules()
    mockCallLLM.mockClear()
    vi.mocked(deriveTasteProfile).mockResolvedValue(defaultProfile)
    await setupAuth()
  })

  it('T10: waste overlap detection runs against current week plan', async () => {
    const currentPlan = [{ recipeId: 'r1', title: 'Pasta', ingredients: 'spinach, pasta' }]
    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue(currentPlan)
    vi.mocked(detectWasteOverlap).mockResolvedValue(new Map())

    mockCallLLM.mockResolvedValue(sampleRecipeJSON)

    const { POST } = await import('@/app/api/recipes/generate/route')
    await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', validBody))

    expect(detectWasteOverlap).toHaveBeenCalledWith(
      [expect.objectContaining({ recipeId: '__generated__' })],
      currentPlan,
      expect.any(Function),
    )
  })

  it('T11: generated recipe with waste match gets wasteBadgeText', async () => {
    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipeId: 'r1', title: 'Pasta', ingredients: 'spinach, pasta' },
    ])

    const wasteMap = new Map([
      ['__generated__', [{ ingredient: 'spinach', wasteRisk: 'high' as const, sharedWith: ['r1'], hasNextWeek: false }]],
    ])
    vi.mocked(detectWasteOverlap).mockResolvedValue(wasteMap)

    mockCallLLM.mockResolvedValue(sampleRecipeJSON)

    const { POST } = await import('@/app/api/recipes/generate/route')
    const res = await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', validBody))
    const body = await res.json()

    expect(body.wasteBadgeText).toBe('Uses up your spinach')
    expect(body.wasteMatches).toHaveLength(1)
  })

  it('T12: generated recipe without waste match has no badge', async () => {
    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipeId: 'r1', title: 'Pasta', ingredients: 'pasta only' },
    ])
    vi.mocked(detectWasteOverlap).mockResolvedValue(new Map())

    mockCallLLM.mockResolvedValue(sampleRecipeJSON)

    const { POST } = await import('@/app/api/recipes/generate/route')
    const res = await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', validBody))
    const body = await res.json()

    expect(body.wasteBadgeText).toBeUndefined()
    expect(body.wasteMatches).toBeUndefined()
  })

  it('T13: regenerating with tweaks re-evaluates waste matches', async () => {
    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipeId: 'r1', title: 'Pasta', ingredients: 'spinach, pasta' },
    ])

    // First call — no waste match
    vi.mocked(detectWasteOverlap).mockResolvedValueOnce(new Map())

    const tweakedRecipeJSON = JSON.stringify({
      ...JSON.parse(sampleRecipeJSON),
      title: 'Tweaked Chicken Spinach',
    })

    mockCallLLM
      .mockResolvedValueOnce(sampleRecipeJSON)
      .mockResolvedValueOnce(tweakedRecipeJSON)

    // First call — no badge
    const { POST } = await import('@/app/api/recipes/generate/route')
    const res1 = await POST(makeRequest('POST', 'http://localhost/api/recipes/generate', validBody))
    const body1 = await res1.json()
    expect(body1.wasteBadgeText).toBeUndefined()

    // Second call — with waste match
    vi.resetModules()
    const wasteMap = new Map([
      ['__generated__', [{ ingredient: 'spinach', wasteRisk: 'high' as const, sharedWith: ['r1'], hasNextWeek: false }]],
    ])
    vi.mocked(detectWasteOverlap).mockResolvedValueOnce(wasteMap)

    const { POST: POST2 } = await import('@/app/api/recipes/generate/route')
    const res2 = await POST2(makeRequest('POST', 'http://localhost/api/recipes/generate', {
      ...validBody,
      tweakRequest: 'add more spinach',
      previousRecipe: { title: 'Chicken Spinach', ingredients: 'chicken\nspinach', steps: 'Cook.' },
    }))
    const body2 = await res2.json()
    expect(body2.wasteBadgeText).toBe('Uses up your spinach')
  })
})
