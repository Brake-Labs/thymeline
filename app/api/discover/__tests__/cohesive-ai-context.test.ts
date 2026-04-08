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

vi.mock('@/lib/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn() },
}))

vi.mock('@/lib/db/schema', () => ({
  recipes: { title: 'title', tags: 'tags', category: 'category', userId: 'userId', householdId: 'householdId', createdAt: 'createdAt' },
}))

vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('drizzle-orm', () => ({
  desc: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  scopeCondition: vi.fn().mockReturnValue({}),
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

import { db } from '@/lib/db'
import { auth } from '@/lib/auth-server'
import { deriveTasteProfile } from '@/lib/taste-profile'
import { detectWasteOverlap } from '@/lib/waste-overlap'
import { fetchCurrentWeekPlan } from '@/lib/plan-utils'
import { callLLM } from '@/lib/llm'

// ── Helpers ───────────────────────────────────────────────────────────────────

const vaultRecipes = [
  { title: 'Chicken Stir Fry', tags: ['Quick'], category: 'main_dish' },
]

function mockDbChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  for (const m of ['from','select','where','orderBy','limit','offset','innerJoin','leftJoin','set','values','onConflictDoUpdate','onConflictDoNothing','returning','groupBy']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve))
  return chain
}

function setupMocks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(db.select).mockReturnValue(mockDbChain(vaultRecipes) as any)
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', image: null },
    session: { id: 'sess-1', createdAt: new Date(), updatedAt: new Date(), userId: 'user-1', expiresAt: new Date(Date.now() + 86400000), token: 'tok' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
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
    siteName:   'example.com',
    description: 'Fresh spinach and feta.',
  },
  {
    url:         'https://example.com/chicken-soup',
    title:       'Chicken Soup',
    siteName:   'example.com',
    description: 'Classic chicken noodle soup.',
  },
]

const defaultProfile = {
  lovedRecipeIds:    [],
  dislikedRecipeIds: [],
  topTags:            ['Quick', 'Healthy'],
  avoidedTags:        [],
  preferredTags:      ['Healthy'],
  mealContext:        null,
  cookingFrequency:   'moderate' as const,
  recentRecipes:      [],
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
    setupMocks()

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    await POST(makeReq({ query: 'spinach salad' }) as Parameters<typeof POST>[0])

    expect(deriveTasteProfile).toHaveBeenCalledWith('user-1', expect.anything(), null)
  })

  it('T03: ranking prompt includes topTags from taste profile', async () => {
    setupMocks()

    vi.mocked(deriveTasteProfile).mockResolvedValue({
      ...defaultProfile,
      topTags: ['Quick', 'Healthy'],
      mealContext: 'Family of 4',
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
    setupMocks()

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
    setupMocks()

    vi.mocked(deriveTasteProfile).mockResolvedValue({
      ...defaultProfile,
      avoidedTags: ['Spicy'],
    })

    const rankedWithAvoidedTag = [
      {
        url: 'https://example.com/spicy-curry',
        title: 'Spicy Curry',
        siteName: 'example.com',
        description: 'A hot curry.',
        suggestedTags: ['Spicy', 'Comfort'],
      },
      {
        url: 'https://example.com/mild-soup',
        title: 'Mild Soup',
        siteName: 'example.com',
        description: 'A gentle soup.',
        suggestedTags: ['Comfort'],
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
    setupMocks()

    const currentPlan = [{ recipeId: 'r1', title: 'Pasta', ingredients: '200g pasta, spinach' }]
    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue(currentPlan)
    vi.mocked(detectWasteOverlap).mockResolvedValue(new Map())

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    await POST(makeReq({ query: 'spinach salad' }) as Parameters<typeof POST>[0])

    expect(detectWasteOverlap).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ recipeId: sampleSearchResults[0]!.url })]),
      currentPlan,
      callLLM,
    )
  })

  it('T05: result with waste match gets wasteBadgeText', async () => {
    setupMocks()

    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipeId: 'r1', title: 'Pasta', ingredients: 'spinach, pasta' },
    ])

    const wasteMap = new Map([
      [sampleSearchResults[0]!.url, [{ ingredient: 'spinach', wasteRisk: 'high' as const, sharedWith: ['r1'], hasNextWeek: false }]],
    ])
    vi.mocked(detectWasteOverlap).mockResolvedValue(wasteMap)

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'spinach salad' }) as Parameters<typeof POST>[0])
    const body = await res.json()
    const matched = body.results.find((r: { url: string }) => r.url === sampleSearchResults[0]!.url)
    expect(matched?.wasteBadgeText).toBe('Uses up your spinach')
    expect(matched?.wasteMatches).toHaveLength(1)
  })

  it('T06: result without waste match has no wasteBadgeText', async () => {
    setupMocks()

    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipeId: 'r1', title: 'Pasta', ingredients: 'pasta' },
    ])
    vi.mocked(detectWasteOverlap).mockResolvedValue(new Map())

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'spinach salad' }) as Parameters<typeof POST>[0])
    const body = await res.json()
    for (const result of body.results) {
      expect(result.wasteBadgeText).toBeUndefined()
    }
  })

  it('T07: waste detection timeout returns results without badges', async () => {
    setupMocks()

    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipeId: 'r1', title: 'Pasta', ingredients: 'spinach, pasta' },
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
      expect(result.wasteBadgeText).toBeUndefined()
    }
  })

  it('T19: no current week plan — waste detection is skipped', async () => {
    setupMocks()

    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([])

    setupSuccessfulLLMCalls()

    const { POST } = await import('../route')
    const res = await POST(makeReq({ query: 'spinach salad' }) as Parameters<typeof POST>[0])

    expect(res.status).toBe(200)
    expect(detectWasteOverlap).not.toHaveBeenCalled()
  })

  it('T21: all discovered recipes sent in a single waste detection call', async () => {
    setupMocks()

    vi.mocked(fetchCurrentWeekPlan).mockResolvedValue([
      { recipeId: 'r1', title: 'Pasta', ingredients: 'pasta' },
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
