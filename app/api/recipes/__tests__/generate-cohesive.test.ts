/**
 * Tests for spec-22 cohesive AI context in POST /api/recipes/generate
 * Covers: T08–T13, T18
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
  scopeQuery: (query: any, userId: string, ctx: any) => {
    if (ctx) return query.eq('household_id', ctx.householdId)
    return query.eq('user_id', userId)
  },
}))

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

import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { deriveTasteProfile } from '@/lib/taste-profile'
import { detectWasteOverlap } from '@/lib/waste-overlap'
import { fetchCurrentWeekPlan } from '@/lib/plan-utils'
import { NextRequest } from 'next/server'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSupabaseMock() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    from: vi.fn(() => ({})),
  }
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/recipes/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  specific_ingredients: 'chicken, spinach',
  meal_type: 'dinner',
  style_hints: '',
  dietary_restrictions: [],
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
  loved_recipe_ids:    [],
  disliked_recipe_ids: [],
  top_tags:            ['Quick', 'Healthy'],
  avoided_tags:        [],
  preferred_tags:      ['Healthy'],
  meal_context:        'Family of 4, quick meals preferred',
  cooking_frequency:   'moderate' as const,
  recent_recipes:      [],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/recipes/generate — spec-22 taste profile (T08–T09)', () => {
  beforeEach(() => {
    vi.resetModules()
    mockCallLLM.mockClear()
    vi.mocked(deriveTasteProfile).mockResolvedValue(defaultProfile)
    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([])
    vi.mocked(detectWasteOverlap).mockResolvedValue(new Map())
  })

  it('T08: calls deriveTasteProfile in the generate route', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)
    mockCallLLM.mockResolvedValue(sampleRecipeJSON)

    const { POST } = await import('@/app/api/recipes/generate/route')
    await POST(makeReq(validBody))

    expect(deriveTasteProfile).toHaveBeenCalledWith('user-1', expect.anything(), null)
  })

  it('T09: system message includes top_tags, meal_context, and cooking_frequency', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)
    mockCallLLM.mockResolvedValue(sampleRecipeJSON)

    const { POST } = await import('@/app/api/recipes/generate/route')
    await POST(makeReq(validBody))

    const callArgs = mockCallLLM.mock.calls[0]![0]
    expect(callArgs.system).toContain('Quick')
    expect(callArgs.system).toContain('Healthy')
    expect(callArgs.system).toContain('Family of 4, quick meals preferred')
    expect(callArgs.system).toContain('moderate')
  })

  it('T18: empty taste profile produces no errors', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.mocked(deriveTasteProfile).mockResolvedValue({
      ...defaultProfile,
      top_tags:    [],
      preferred_tags: [],
      meal_context: null,
    })

    mockCallLLM.mockResolvedValue(sampleRecipeJSON)

    const { POST } = await import('@/app/api/recipes/generate/route')
    const res = await POST(makeReq(validBody))

    expect(res.status).toBe(200)
  })
})

describe('POST /api/recipes/generate — spec-22 waste detection (T10–T13)', () => {
  beforeEach(() => {
    vi.resetModules()
    mockCallLLM.mockClear()
    vi.mocked(deriveTasteProfile).mockResolvedValue(defaultProfile)
  })

  it('T10: waste overlap detection runs against current week plan', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    const currentPlan = [{ recipe_id: 'r1', title: 'Pasta', ingredients: 'spinach, pasta' }]
    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue(currentPlan)
    vi.mocked(detectWasteOverlap).mockResolvedValue(new Map())

    mockCallLLM.mockResolvedValue(sampleRecipeJSON)

    const { POST } = await import('@/app/api/recipes/generate/route')
    await POST(makeReq(validBody))

    expect(detectWasteOverlap).toHaveBeenCalledWith(
      [expect.objectContaining({ recipe_id: '__generated__' })],
      currentPlan,
      expect.any(Function),
    )
  })

  it('T11: generated recipe with waste match gets waste_badge_text', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipe_id: 'r1', title: 'Pasta', ingredients: 'spinach, pasta' },
    ])

    const wasteMap = new Map([
      ['__generated__', [{ ingredient: 'spinach', waste_risk: 'high' as const, shared_with: ['r1'], has_next_week: false }]],
    ])
    vi.mocked(detectWasteOverlap).mockResolvedValue(wasteMap)

    mockCallLLM.mockResolvedValue(sampleRecipeJSON)

    const { POST } = await import('@/app/api/recipes/generate/route')
    const res = await POST(makeReq(validBody))
    const body = await res.json()

    expect(body.waste_badge_text).toBe('Uses up your spinach')
    expect(body.waste_matches).toHaveLength(1)
  })

  it('T12: generated recipe without waste match has no badge', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipe_id: 'r1', title: 'Pasta', ingredients: 'pasta only' },
    ])
    vi.mocked(detectWasteOverlap).mockResolvedValue(new Map())

    mockCallLLM.mockResolvedValue(sampleRecipeJSON)

    const { POST } = await import('@/app/api/recipes/generate/route')
    const res = await POST(makeReq(validBody))
    const body = await res.json()

    expect(body.waste_badge_text).toBeUndefined()
    expect(body.waste_matches).toBeUndefined()
  })

  it('T13: regenerating with tweaks re-evaluates waste matches', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipe_id: 'r1', title: 'Pasta', ingredients: 'spinach, pasta' },
    ])

    // First call — no waste match
    vi.mocked(detectWasteOverlap).mockResolvedValueOnce(new Map())

    const tweakedRecipeJSON = JSON.stringify({
      ...JSON.parse(sampleRecipeJSON),
      title: 'Tweaked Chicken Spinach',
    })

    mockCallLLM
      .mockResolvedValueOnce(sampleRecipeJSON)    // first generate
      .mockResolvedValueOnce(tweakedRecipeJSON)   // tweak

    // First call — no badge
    const { POST } = await import('@/app/api/recipes/generate/route')
    const res1 = await POST(makeReq(validBody))
    const body1 = await res1.json()
    expect(body1.waste_badge_text).toBeUndefined()

    // Second call — with waste match
    vi.resetModules()
    const wasteMap = new Map([
      ['__generated__', [{ ingredient: 'spinach', waste_risk: 'high' as const, shared_with: ['r1'], has_next_week: false }]],
    ])
    vi.mocked(detectWasteOverlap).mockResolvedValueOnce(wasteMap)

    const { POST: POST2 } = await import('@/app/api/recipes/generate/route')
    const res2 = await POST2(makeReq({
      ...validBody,
      tweak_request: 'add more spinach',
      previous_recipe: { title: 'Chicken Spinach', ingredients: 'chicken\nspinach', steps: 'Cook.' },
    }))
    const body2 = await res2.json()
    expect(body2.waste_badge_text).toBe('Uses up your spinach')
  })
})
