/**
 * Tests for taste profile injection into plan suggest route.
 * Covers spec test cases: T17, T18, T19, T20
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Shared mock state ──────────────────────────────────────────────────────────

const mockRecipes = [
  { id: 'r1', title: 'Pasta',  tags: ['Quick'],   category: 'main_dish' },
  { id: 'r2', title: 'Tacos',  tags: ['Healthy'], category: 'main_dish' },
  { id: 'r3', title: 'Soup',   tags: ['Comfort'], category: 'main_dish' },
]

let capturedSystemMessage = ''
let capturedUserMessage = ''

let mockRecentHistory: { recipeId: string }[] = []
let mockCooldownDays = 0

let tasteProfileOverride = {
  lovedRecipeIds: [] as string[],
  dislikedRecipeIds: [] as string[],
  topTags: [] as string[],
  avoidedTags: [] as string[],
  preferredTags: [] as string[],
  mealContext: null as string | null,
  cookingFrequency: 'moderate' as const,
  recentRecipes: [] as { recipeId: string; title: string; madeOn: string }[],
}

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/taste-profile', () => ({
  deriveTasteProfile: vi.fn().mockImplementation(() => Promise.resolve(tasteProfileOverride)),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('@/lib/db/schema', () => ({
  recipes: { id: 'id', userId: 'userId', householdId: 'householdId', title: 'title', tags: 'tags', category: 'category' },
  recipeHistory: { recipeId: 'recipeId', userId: 'userId', madeOn: 'madeOn' },
  mealPlans: { id: 'id', userId: 'userId', weekStart: 'weekStart', householdId: 'householdId' },
  mealPlanEntries: { id: 'id', mealPlanId: 'mealPlanId', recipeId: 'recipeId', plannedDate: 'plannedDate' },
  userPreferences: { userId: 'userId' },
  pantryItems: { userId: 'userId', name: 'name', expiryDate: 'expiryDate', householdId: 'householdId' },
}))

vi.mock('@/lib/db/helpers', () => ({
  dbFirst: (rows: unknown[]) => rows[0] ?? null,
  dbSingle: (rows: unknown[]) => {
    if (rows.length === 0) throw new Error('Expected exactly one row, got 0')
    return rows[0]
  },
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  canManage: () => true,
  scopeCondition: vi.fn().mockReturnValue({}),
  scopeInsert: vi.fn((userId: string) => ({ userId })),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: function MockAnthropic(this: any) {
    this.messages = {
      create: vi.fn().mockImplementation(async (opts: { system?: string; messages?: { content: string }[] }) => {
        capturedSystemMessage = opts.system ?? ''
        capturedUserMessage = opts.messages?.[0]?.content ?? ''
        return {
          content: [{ type: 'text', text: JSON.stringify({
            days: [{
              date: '2026-03-02',
              mealTypes: [{ mealType: 'dinner', options: [{ recipeId: 'r1', recipeTitle: 'Pasta', reason: 'test' }] }],
            }],
          }) }],
        }
      }),
      stream: () => { throw new Error('streaming not available in tests') },
    }
  },
}))

// Mock the plan helpers
vi.mock('@/app/api/plan/helpers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/plan/helpers')>('@/app/api/plan/helpers')
  return {
    ...actual,
    fetchRecipesByMealTypes: vi.fn().mockImplementation(async () => {
      // Filter by cooldown
      const available = mockCooldownDays > 0 && mockRecentHistory.length > 0
        ? mockRecipes.filter(r => !mockRecentHistory.some(h => h.recipeId === r.id))
        : mockRecipes
      return { dinner: available.filter(r => r.category === 'main_dish') }
    }),
    fetchUserPreferences: vi.fn().mockImplementation(async () => ({
      userId: 'user-1', optionsPerDay: 3, cooldownDays: mockCooldownDays, seasonalMode: false,
      preferredTags: [], avoidedTags: [], limitedTags: [], seasonalRules: null,
      onboardingCompleted: true, isActive: true,
    })),
    fetchRecentHistory: vi.fn().mockResolvedValue([]),
    fetchPantryContext: vi.fn().mockResolvedValue(''),
  }
})

// Mock db.select to return empty plans (no already-planned exclusion)
function mockChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin', 'leftJoin',
    'set', 'values', 'onConflictDoUpdate', 'onConflictDoNothing', 'returning', 'groupBy']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
  )
  return chain
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/plan/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const baseBody = {
  weekStart:    '2026-03-01',
  activeDates:  ['2026-03-02'],
  activeMealTypes: ['dinner'],
  preferThisWeek:  [],
  avoidThisWeek:   [],
  freeText: '',
}

beforeEach(async () => {
  vi.resetModules()
  capturedSystemMessage = ''
  capturedUserMessage = ''
  mockRecentHistory = []
  mockCooldownDays = 0
  tasteProfileOverride = {
    lovedRecipeIds: [],
    dislikedRecipeIds: [],
    topTags: [],
    avoidedTags: [],
    preferredTags: [],
    mealContext: null,
    cookingFrequency: 'moderate',
    recentRecipes: [],
  }

  const { auth } = await import('@/lib/auth-server')
  const mockSession = {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', image: null },
    session: { id: 'sess-1', createdAt: new Date(), updatedAt: new Date(), userId: 'user-1', expiresAt: new Date(Date.now() + 86400000), token: 'tok' },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session type
  vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as any)

  const { db } = await import('@/lib/db')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock chain type
  vi.mocked(db.select).mockReturnValue(mockChain([]) as any)
})

describe('Plan suggest — taste profile injection', () => {

  // T17: Disliked recipes absent from candidate pool before LLM call
  it('T17: disliked recipes are excluded from the candidate pool', async () => {
    tasteProfileOverride.dislikedRecipeIds = ['r2'] // Tacos
    const { POST } = await import('@/app/api/plan/suggest/route')
    await POST(makeReq(baseBody) as Parameters<typeof POST>[0])

    // r2 should NOT appear in the user message sent to LLM
    expect(capturedUserMessage).not.toContain('"r2"')
  })

  // T18: Loved recipes appear before non-loved recipes in candidate pool
  it('T18: loved recipes are listed before non-loved in the user message', async () => {
    tasteProfileOverride.lovedRecipeIds = ['r3'] // Soup
    const { POST } = await import('@/app/api/plan/suggest/route')
    await POST(makeReq(baseBody) as Parameters<typeof POST>[0])

    // r3 should appear with [LOVED] annotation
    expect(capturedUserMessage).toContain('[LOVED]')
    // And r3 should appear before r1/r2 in the JSON (LOVED first)
    const r3Pos = capturedUserMessage.indexOf('"r3"')
    const r1Pos = capturedUserMessage.indexOf('"r1"')
    expect(r3Pos).toBeLessThan(r1Pos)
  })

  // T19: Taste profile injected into system message
  it('T19: taste profile section appears in system message when profile is non-empty', async () => {
    tasteProfileOverride.topTags = ['Italian', 'Quick']
    const { POST } = await import('@/app/api/plan/suggest/route')
    await POST(makeReq(baseBody) as Parameters<typeof POST>[0])

    expect(capturedSystemMessage).toContain('Taste profile:')
    expect(capturedSystemMessage).toContain('Italian')
  })

  // T20: Empty profile produces no errors in plan suggest
  it('T20: empty taste profile causes no errors and system message lacks taste section', async () => {
    // tasteProfileOverride is already the empty default
    const { POST } = await import('@/app/api/plan/suggest/route')
    const res = await POST(makeReq(baseBody) as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    expect(capturedSystemMessage).not.toContain('Taste profile:')
  })

  // T21: Loved recipes still respect cooldown
  it('T21: loved recipe within cooldown is absent from candidate pool (not boosted past cooldown)', async () => {
    // r2 (Tacos) is loved but was cooked 3 days ago — within the 28-day cooldown
    tasteProfileOverride.lovedRecipeIds = ['r2']
    mockCooldownDays = 28
    mockRecentHistory = [{ recipeId: 'r2' }]

    const { POST } = await import('@/app/api/plan/suggest/route')
    await POST(makeReq(baseBody) as Parameters<typeof POST>[0])

    // r2 must NOT appear in the candidate pool sent to the LLM
    expect(capturedUserMessage).not.toContain('"r2"')
    // r1 and r3 (outside cooldown) must still be present
    expect(capturedUserMessage).toContain('"r1"')
  })
})
