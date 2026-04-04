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

let mockRecentHistory: { recipe_id: string }[] = []
let mockCooldownDays = 0

let tasteProfileOverride = {
  loved_recipe_ids: [] as string[],
  disliked_recipe_ids: [] as string[],
  top_tags: [] as string[],
  avoided_tags: [] as string[],
  preferred_tags: [] as string[],
  meal_context: null as string | null,
  cooking_frequency: 'moderate' as const,
  recent_recipes: [] as { recipe_id: string; title: string; made_on: string }[],
}

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/taste-profile', () => ({
  deriveTasteProfile: vi.fn().mockImplementation(() => Promise.resolve(tasteProfileOverride)),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient:  vi.fn(() => makeDb()),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  canManage: () => true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scopeQuery: (query: any, userId: string) => query.eq('user_id', userId),
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
              meal_types: [{ meal_type: 'dinner', options: [{ recipe_id: 'r1', recipe_title: 'Pasta', reason: 'test' }] }],
            }],
          }) }],
        }
      }),
      stream: () => { throw new Error('streaming not available in tests') },
    }
  },
}))

import { createServerClient } from '@/lib/supabase-server'

function makeDb() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'recipes') {
        return {
          select: () => ({
            in: (_col: string, cats: string[]) => ({
              eq: () => ({
                in: () => ({
                  then: (resolve: (v: { data: typeof mockRecipes; error: null }) => void) =>
                    Promise.resolve({ data: mockRecipes.filter((r) => cats.includes(r.category)), error: null }).then(resolve),
                }),
                then: (resolve: (v: { data: typeof mockRecipes; error: null }) => void) =>
                  Promise.resolve({ data: mockRecipes.filter((r) => cats.includes(r.category)), error: null }).then(resolve),
              }),
              then: (resolve: (v: { data: typeof mockRecipes; error: null }) => void) =>
                Promise.resolve({ data: mockRecipes.filter((r) => cats.includes(r.category)), error: null }).then(resolve),
            }),
          }),
        }
      }
      if (table === 'recipe_history') {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          gte: async () => ({ data: mockRecentHistory, error: null }),
          order: () => ({ limit: async () => ({ data: [], error: null }) }),
          then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        }
        return chain
      }
      if (table === 'user_preferences') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { user_id: 'user-1', options_per_day: 3, cooldown_days: mockCooldownDays, seasonal_mode: false,
                  preferred_tags: [], avoided_tags: [], limited_tags: [], seasonal_rules: null,
                  onboarding_completed: true, is_active: true },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'meal_plans') {
        return {
          select: () => ({
            eq: () => Object.assign(
              Promise.resolve({ data: [], error: null }),
              { eq: () => Object.assign(Promise.resolve({ data: [], error: null }), { maybeSingle: async () => ({ data: null, error: null }) }) },
            ),
          }),
        }
      }
      if (table === 'meal_plan_entries') {
        return {
          select: () => ({
            eq: () => ({ gte: async () => ({ data: [], error: null }) }),
          }),
        }
      }
      if (table === 'pantry_items') {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: async () => ({ data: [], error: null }),
        }
        return chain
      }
      return {}
    }),
  }
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/plan/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

const baseBody = {
  week_start:    '2026-03-01',
  active_dates:  ['2026-03-02'],
  active_meal_types: ['dinner'],
  prefer_this_week:  [],
  avoid_this_week:   [],
  free_text: '',
}

beforeEach(() => {
  vi.resetModules()
  capturedSystemMessage = ''
  capturedUserMessage = ''
  mockRecentHistory = []
  mockCooldownDays = 0
  tasteProfileOverride = {
    loved_recipe_ids: [],
    disliked_recipe_ids: [],
    top_tags: [],
    avoided_tags: [],
    preferred_tags: [],
    meal_context: null,
    cooking_frequency: 'moderate',
    recent_recipes: [],
  }
  vi.mocked(createServerClient).mockReturnValue(makeDb() as unknown as ReturnType<typeof createServerClient>)
})

describe('Plan suggest — taste profile injection', () => {

  // T17: Disliked recipes absent from candidate pool before LLM call
  it('T17: disliked recipes are excluded from the candidate pool', async () => {
    tasteProfileOverride.disliked_recipe_ids = ['r2'] // Tacos
    const { POST } = await import('@/app/api/plan/suggest/route')
    await POST(makeReq(baseBody) as Parameters<typeof POST>[0])

    // r2 should NOT appear in the user message sent to LLM
    expect(capturedUserMessage).not.toContain('"r2"')
  })

  // T18: Loved recipes appear before non-loved recipes in candidate pool
  it('T18: loved recipes are listed before non-loved in the user message', async () => {
    tasteProfileOverride.loved_recipe_ids = ['r3'] // Soup
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
    tasteProfileOverride.top_tags = ['Italian', 'Quick']
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
    tasteProfileOverride.loved_recipe_ids = ['r2']
    mockCooldownDays = 28
    mockRecentHistory = [{ recipe_id: 'r2' }]

    const { POST } = await import('@/app/api/plan/suggest/route')
    await POST(makeReq(baseBody) as Parameters<typeof POST>[0])

    // r2 must NOT appear in the candidate pool sent to the LLM
    expect(capturedUserMessage).not.toContain('"r2"')
    // r1 and r3 (outside cooldown) must still be present
    expect(capturedUserMessage).toContain('"r1"')
  })
})
