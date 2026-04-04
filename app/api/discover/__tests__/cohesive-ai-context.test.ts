/**
 * Tests for spec-22 cohesive AI context in POST /api/discover
 * Covers: T01–T07, T19–T22
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock state ────────────────────────────────────────────────────────────────

const mockAnthropicCreate = vi.fn()

vi.mock('@/lib/llm', () => ({
  anthropic: {
    messages: { create: (...args: unknown[]) => mockAnthropicCreate(...args) },
  },
  parseLLMJson: (text: string) => {
    const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
    return JSON.parse(stripped)
  },
  LLM_MODEL_CAPABLE: 'claude-sonnet-4-6',
  callLLM: vi.fn(),
}))

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

vi.mock('@/lib/taste-profile', () => ({
  deriveTasteProfile: vi.fn(),
}))

vi.mock('@/lib/waste-overlap', () => ({
  detectWasteOverlap: vi.fn(),
}))

vi.mock('@/lib/plan-utils', () => ({
  fetchCurrentWeekPlan:   vi.fn(),
  getPlanWasteBadgeText:  vi.fn((matches) => {
    if (!matches.length) return ''
    if (matches.length >= 2) return `Uses up ${matches.length} ingredients`
    return `Uses up your ${matches[0].ingredient}`
  }),
}))

import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { deriveTasteProfile } from '@/lib/taste-profile'
import { detectWasteOverlap } from '@/lib/waste-overlap'
import { fetchCurrentWeekPlan } from '@/lib/plan-utils'
import { callLLM } from '@/lib/llm'

// ── Helpers ───────────────────────────────────────────────────────────────────

const vaultRecipes = [
  { title: 'Chicken Stir Fry', tags: ['Quick'], category: 'main_dish' },
]

function makeSupabaseMock() {
  const vaultChain = {
    select: vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    limit:  vi.fn().mockReturnThis(),
    eq:     vi.fn().mockResolvedValue({ data: vaultRecipes, error: null }),
  }
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    from: vi.fn(() => vaultChain),
  }
}

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

function makeTextMsg(text: string) {
  return { content: [{ type: 'text', text }] }
}

const sampleSearchResults = [
  {
    url:         'https://example.com/spinach-salad',
    title:       'Spinach Salad',
    site_name:   'example.com',
    description: 'Fresh spinach and feta.',
  },
  {
    url:         'https://example.com/chicken-soup',
    title:       'Chicken Soup',
    site_name:   'example.com',
    description: 'Classic chicken noodle soup.',
  },
]

const defaultProfile = {
  loved_recipe_ids:    [],
  disliked_recipe_ids: [],
  top_tags:            ['Quick', 'Healthy'],
  avoided_tags:        [],
  preferred_tags:      ['Healthy'],
  meal_context:        null,
  cooking_frequency:   'moderate' as const,
  recent_recipes:      [],
}

function setupSuccessfulLLMCalls(rankResults = sampleSearchResults) {
  mockAnthropicCreate
    .mockResolvedValueOnce(makeTextMsg('["spinach salad recipe"]'))        // query gen
    .mockResolvedValueOnce(makeTextMsg(JSON.stringify(sampleSearchResults))) // web search
    .mockResolvedValueOnce(makeTextMsg(JSON.stringify(rankResults)))        // ranking
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/discover — spec-22 taste profile (T01–T03)', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAnthropicCreate.mockClear()
    vi.mocked(deriveTasteProfile).mockResolvedValue(defaultProfile)
    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([])
    vi.mocked(detectWasteOverlap).mockResolvedValue(new Map())
  })

  it('T01: calls deriveTasteProfile in the discover route', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    await POST(makeReq({ query: 'spinach salad' }) as Parameters<typeof POST>[0])

    expect(deriveTasteProfile).toHaveBeenCalledWith('user-1', expect.anything(), null)
  })

  it('T03: ranking prompt includes top_tags from taste profile', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.mocked(deriveTasteProfile).mockResolvedValue({
      ...defaultProfile,
      top_tags: ['Quick', 'Healthy'],
      meal_context: 'Family of 4',
    })

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    await POST(makeReq({ query: 'quick dinner' }) as Parameters<typeof POST>[0])

    // Third call is the ranking call
    const rankCall = mockAnthropicCreate.mock.calls[2]![0]
    const content: string = rankCall.messages[0].content
    expect(content).toContain('Quick')
    expect(content).toContain('Healthy')
    expect(content).toContain('Family of 4')
  })

  it('T22: ranking step uses LLM_MODEL_CAPABLE', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    await POST(makeReq({ query: 'quick dinner' }) as Parameters<typeof POST>[0])

    const rankCall = mockAnthropicCreate.mock.calls[2]![0]
    expect(rankCall.model).toBe('claude-sonnet-4-6')
  })
})

describe('POST /api/discover — spec-22 avoided-tag filter (T02)', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAnthropicCreate.mockClear()
    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([])
    vi.mocked(detectWasteOverlap).mockResolvedValue(new Map())
  })

  it('T02: results with avoided tags are filtered out', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.mocked(deriveTasteProfile).mockResolvedValue({
      ...defaultProfile,
      avoided_tags: ['Spicy'],
    })

    const rankedWithAvoidedTag = [
      {
        url: 'https://example.com/spicy-curry',
        title: 'Spicy Curry',
        site_name: 'example.com',
        description: 'A hot curry.',
        suggested_tags: ['Spicy', 'Comfort'],
      },
      {
        url: 'https://example.com/mild-soup',
        title: 'Mild Soup',
        site_name: 'example.com',
        description: 'A gentle soup.',
        suggested_tags: ['Comfort'],
      },
    ]

    mockAnthropicCreate
      .mockResolvedValueOnce(makeTextMsg('["spicy food"]'))
      .mockResolvedValueOnce(makeTextMsg(JSON.stringify(rankedWithAvoidedTag)))
      .mockResolvedValueOnce(makeTextMsg(JSON.stringify(rankedWithAvoidedTag)))

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'spicy food' }) as Parameters<typeof POST>[0])

    expect(res.status).toBe(200)
    const body = await res.json()
    const urls = body.results.map((r: { url: string }) => r.url)
    expect(urls).not.toContain('https://example.com/spicy-curry')
    expect(urls).toContain('https://example.com/mild-soup')
  })
})

describe('POST /api/discover — spec-22 waste detection (T04–T07)', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAnthropicCreate.mockClear()
    vi.mocked(deriveTasteProfile).mockResolvedValue(defaultProfile)
    vi.mocked(detectWasteOverlap).mockClear()
    vi.mocked(fetchCurrentWeekPlan).mockClear()
  })

  it('T04: waste overlap detection runs against current week plan', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    const currentPlan = [{ recipe_id: 'r1', title: 'Pasta', ingredients: '200g pasta, spinach' }]
    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue(currentPlan)
    vi.mocked(detectWasteOverlap).mockResolvedValue(new Map())

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    await POST(makeReq({ query: 'spinach salad' }) as Parameters<typeof POST>[0])

    expect(detectWasteOverlap).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ recipe_id: sampleSearchResults[0]!.url })]),
      currentPlan,
      callLLM,
    )
  })

  it('T05: result with waste match gets waste_badge_text', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipe_id: 'r1', title: 'Pasta', ingredients: 'spinach, pasta' },
    ])

    const wasteMap = new Map([
      [sampleSearchResults[0]!.url, [{ ingredient: 'spinach', waste_risk: 'high' as const, shared_with: ['r1'], has_next_week: false }]],
    ])
    vi.mocked(detectWasteOverlap).mockResolvedValue(wasteMap)

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'spinach salad' }) as Parameters<typeof POST>[0])
    const body = await res.json()
    const matched = body.results.find((r: { url: string }) => r.url === sampleSearchResults[0]!.url)
    expect(matched?.waste_badge_text).toBe('Uses up your spinach')
    expect(matched?.waste_matches).toHaveLength(1)
  })

  it('T06: result without waste match has no waste_badge_text', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipe_id: 'r1', title: 'Pasta', ingredients: 'pasta' },
    ])
    vi.mocked(detectWasteOverlap).mockResolvedValue(new Map())

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'spinach salad' }) as Parameters<typeof POST>[0])
    const body = await res.json()
    for (const result of body.results) {
      expect(result.waste_badge_text).toBeUndefined()
    }
  })

  it('T07: waste detection timeout returns results without badges', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipe_id: 'r1', title: 'Pasta', ingredients: 'spinach, pasta' },
    ])
    // Simulate a timeout by having detectWasteOverlap never resolve
    vi.mocked(detectWasteOverlap).mockReturnValue(new Promise(() => {}))

    // Use fake timers to trigger the timeout immediately
    vi.useFakeTimers()

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    const responsePromise = POST(makeReq({ query: 'spinach salad' }) as Parameters<typeof POST>[0])

    // Advance time past the 5s timeout
    await vi.advanceTimersByTimeAsync(6000)
    const res = await responsePromise

    vi.useRealTimers()

    expect(res.status).toBe(200)
    const body = await res.json()
    for (const result of body.results) {
      expect(result.waste_badge_text).toBeUndefined()
    }
  })

  it('T19: no current week plan — waste detection is skipped', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([])

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'spinach salad' }) as Parameters<typeof POST>[0])

    expect(res.status).toBe(200)
    expect(detectWasteOverlap).not.toHaveBeenCalled()
  })

  it('T21: all discovered recipes sent in a single waste detection call', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipe_id: 'r1', title: 'Pasta', ingredients: 'pasta' },
    ])
    vi.mocked(detectWasteOverlap).mockResolvedValue(new Map())

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    await POST(makeReq({ query: 'salad' }) as Parameters<typeof POST>[0])

    expect(detectWasteOverlap).toHaveBeenCalledTimes(1)
    const call = vi.mocked(detectWasteOverlap).mock.calls[0]!
    // All results sent as thisWeek
    expect(call[0]).toHaveLength(sampleSearchResults.length)
  })
})
