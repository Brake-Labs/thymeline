/**
 * Tests for lib/taste-profile.ts
 * Covers spec test cases: T10, T11, T12, T13, T14, T15, T16, T22
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock the db module ─────────────────────────────────────────────────────────

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

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  }
  return { mockDb }
})

vi.mock('@/lib/db', () => ({
  db: mockDb,
}))

import { deriveTasteProfile, IMPLICIT_LOVE_THRESHOLD } from '@/lib/taste-profile'

// Helper: YYYY-MM-DD for N days ago
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * Sets up mock db.select to return data for the deriveTasteProfile query sequence.
 * Solo user (ctx=null) query order:
 *   1. userPreferences
 *   2. recipeHistory (explicitLoved: makeAgain=true)
 *   3. recipeHistory (recentHistoryRows: 6 months)
 *   4. recipeHistory (disliked: makeAgain=false)
 *   5. recipeHistory + recipes join (tagHistory)
 *   6. recipeHistory (recent30)
 *   7. recipeHistory + recipes join (recent, with orderBy + limit)
 *
 * Household (ctx set) adds one query at the start:
 *   0. householdMembers
 */
function setupMockQueries(opts: {
  prefs?: unknown[]
  explicitLoved?: unknown[]
  recentHistory?: unknown[]
  disliked?: unknown[]
  tagHistory?: unknown[]
  recent30?: unknown[]
  recentRecipes?: unknown[]
  householdMembers?: unknown[]
}) {
  const queries: unknown[][] = []

  // If household members are provided, that query comes first
  if (opts.householdMembers) {
    queries.push(opts.householdMembers)
  }

  queries.push(
    opts.prefs ?? [],                // userPreferences
    opts.explicitLoved ?? [],        // explicitLoved
    opts.recentHistory ?? [],        // recentHistoryRows
    opts.disliked ?? [],             // disliked
    opts.tagHistory ?? [],           // tagHistory
    opts.recent30 ?? [],             // recent30
    opts.recentRecipes ?? [],        // recentRecipes
  )

  let callIdx = 0
  mockDb.select.mockImplementation(() => {
    const result = queries[callIdx] ?? []
    callIdx++
    return mockChain(result)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── T10: loved_recipe_ids includes make_again=true entries ──────────────────

describe('deriveTasteProfile', () => {
  it('T10: loved_recipe_ids includes make_again=true entries', async () => {
    setupMockQueries({
      prefs: [{ avoidedTags: [], preferredTags: [], mealContext: null }],
      explicitLoved: [{ recipeId: 'r1' }],
      recentHistory: [],
      disliked: [{ recipeId: 'r2' }],
    })

    const profile = await deriveTasteProfile('user-1', null, null)
    expect(profile.loved_recipe_ids).toContain('r1')
    expect(profile.disliked_recipe_ids).toContain('r2')
  })

  // ── T11: implicit love via 3+ cooks in 6 months ──────────────────────────

  it('T11: loved_recipe_ids includes recipes made 3+ times in 6 months', async () => {
    const threshold = IMPLICIT_LOVE_THRESHOLD // 3
    setupMockQueries({
      prefs: [{ avoidedTags: [], preferredTags: [], mealContext: null }],
      explicitLoved: [],
      recentHistory: [
        // r1: cooked exactly threshold times
        ...Array.from({ length: threshold }, (_, i) => ({
          recipeId: 'r1', madeOn: daysAgo(5 + i),
        })),
        // r2: cooked threshold-1 times
        ...Array.from({ length: threshold - 1 }, (_, i) => ({
          recipeId: 'r2', madeOn: daysAgo(5 + i),
        })),
      ],
      disliked: [],
    })

    const profile = await deriveTasteProfile('user-1', null, null)
    expect(profile.loved_recipe_ids).toContain('r1')
    expect(profile.loved_recipe_ids).not.toContain('r2')
  })

  // ── T12: disliked_recipe_ids includes make_again=false entries ────────────

  it('T12: disliked_recipe_ids includes make_again=false entries', async () => {
    setupMockQueries({
      prefs: [{ avoidedTags: [], preferredTags: [], mealContext: null }],
      explicitLoved: [],
      recentHistory: [],
      disliked: [{ recipeId: 'r3' }],
    })

    const profile = await deriveTasteProfile('user-1', null, null)
    expect(profile.disliked_recipe_ids).toContain('r3')
  })

  // ── T13: top_tags weighted correctly (last 30d = 3x) ─────────────────────

  it('T13: top_tags -- last-30d entries get 3x weight vs older entries', async () => {
    setupMockQueries({
      prefs: [{ avoidedTags: [], preferredTags: [], mealContext: null }],
      explicitLoved: [],
      recentHistory: [],
      disliked: [],
      tagHistory: [
        // tagA: one old entry (1x weight)
        { madeOn: daysAgo(120), tags: ['tagA'] },
        // tagB: one recent entry (3x weight)
        { madeOn: daysAgo(10), tags: ['tagB'] },
      ],
    })

    const profile = await deriveTasteProfile('user-1', null, null)
    const tagBIdx = profile.top_tags.indexOf('tagB')
    const tagAIdx = profile.top_tags.indexOf('tagA')
    // tagB should rank higher than tagA because 3x > 1x
    expect(tagBIdx).toBeGreaterThanOrEqual(0)
    expect(tagAIdx).toBeGreaterThanOrEqual(0)
    expect(tagBIdx).toBeLessThan(tagAIdx)
  })

  // ── T14: cooking_frequency buckets ────────────────────────────────────────

  it('T14: cooking_frequency = light for 0-2 distinct recipes in last 30d', async () => {
    setupMockQueries({
      prefs: [{ avoidedTags: [], preferredTags: [], mealContext: null }],
      explicitLoved: [],
      recentHistory: [],
      disliked: [],
      tagHistory: [],
      recent30: [{ recipeId: 'r1' }],
    })

    const profile = await deriveTasteProfile('user-1', null, null)
    expect(profile.cooking_frequency).toBe('light')
  })

  it('T14: cooking_frequency = moderate for 3-6 distinct recipes in last 30d', async () => {
    setupMockQueries({
      prefs: [{ avoidedTags: [], preferredTags: [], mealContext: null }],
      explicitLoved: [],
      recentHistory: [],
      disliked: [],
      tagHistory: [],
      recent30: [
        { recipeId: 'r1' },
        { recipeId: 'r2' },
        { recipeId: 'r3' },
        { recipeId: 'r4' },
      ],
    })

    const profile = await deriveTasteProfile('user-1', null, null)
    expect(profile.cooking_frequency).toBe('moderate')
  })

  it('T14: cooking_frequency = frequent for 7+ distinct recipes in last 30d', async () => {
    setupMockQueries({
      prefs: [{ avoidedTags: [], preferredTags: [], mealContext: null }],
      explicitLoved: [],
      recentHistory: [],
      disliked: [],
      tagHistory: [],
      recent30: Array.from({ length: 8 }, (_, i) => ({ recipeId: `r${i}` })),
    })

    const profile = await deriveTasteProfile('user-1', null, null)
    expect(profile.cooking_frequency).toBe('frequent')
  })

  // ── T15: recent_recipes ───────────────────────────────────────────────────

  it('T15: recent_recipes returns up to 10 entries', async () => {
    setupMockQueries({
      prefs: [{ avoidedTags: [], preferredTags: [], mealContext: null }],
      explicitLoved: [],
      recentHistory: [],
      disliked: [],
      tagHistory: [],
      recent30: [],
      recentRecipes: Array.from({ length: 10 }, (_, i) => ({
        recipeId: `r${i}`,
        madeOn: daysAgo(i + 1),
        title: `Recipe ${i}`,
      })),
    })

    const profile = await deriveTasteProfile('user-1', null, null)
    expect(profile.recent_recipes.length).toBeLessThanOrEqual(10)
  })

  // ── T16: empty history ────────────────────────────────────────────────────

  it('T16: empty history returns empty arrays and no error', async () => {
    setupMockQueries({
      prefs: [],
      explicitLoved: [],
      recentHistory: [],
      disliked: [],
      tagHistory: [],
      recent30: [],
      recentRecipes: [],
    })

    const profile = await deriveTasteProfile('user-1', null, null)
    expect(profile.loved_recipe_ids).toEqual([])
    expect(profile.disliked_recipe_ids).toEqual([])
    expect(profile.top_tags).toEqual([])
    expect(profile.recent_recipes).toEqual([])
    expect(profile.cooking_frequency).toBe('light')
  })

  // ── T22: household — aggregate history from all member user IDs ──────────

  it('T22: household mode aggregates history from all member user IDs', async () => {
    setupMockQueries({
      householdMembers: [{ userId: 'user-1' }, { userId: 'user-2' }],
      prefs: [{ avoidedTags: [], preferredTags: [], mealContext: null }],
      explicitLoved: [{ recipeId: 'r99' }],
      recentHistory: [],
      disliked: [],
      tagHistory: [],
      recent30: [],
      recentRecipes: [],
    })

    const profile = await deriveTasteProfile('user-1', null, { householdId: 'hh-1', role: 'owner' })
    expect(profile.loved_recipe_ids).toContain('r99')
  })
})
