/**
 * Tests for lib/taste-profile.ts
 * Covers spec test cases: T10, T11, T12, T13, T14, T15, T16, T22
 */

import { describe, it, expect } from 'vitest'
import { deriveTasteProfile, IMPLICIT_LOVE_THRESHOLD } from '@/lib/taste-profile'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Helper: YYYY-MM-DD for N days ago
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// Build a minimal Supabase mock that returns data from a fixture table.
// Tracks filter state so eq/gte/limit work correctly.
function makeDb(tables: Record<string, unknown[]>): SupabaseClient<Database> {
  function makeQueryChain(allRows: unknown[]) {
    let filtered = allRows
    let limitN: number | null = null

    function resolveRows() {
      return limitN !== null ? filtered.slice(0, limitN) : filtered
    }

    const chain: Record<string, unknown> = {
      select: () => chain,
      in:     () => chain,
      order:  () => chain,
      eq: (_col: string, val: unknown) => {
        filtered = filtered.filter((r) => {
          const row = r as Record<string, unknown>
          // Treat missing column as null (not as "pass through")
          const rowVal = _col in row ? row[_col] : null
          return rowVal === val
        })
        return chain
      },
      gte: (_col: string, val: string) => {
        filtered = filtered.filter((r) => {
          const row = r as Record<string, unknown>
          const rowVal = _col in row ? String(row[_col]) : null
          if (rowVal === null) return false
          return rowVal >= val
        })
        return chain
      },
      limit: (n: number) => {
        limitN = n
        return Promise.resolve({ data: resolveRows(), error: null })
      },
      maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
      single:     () => Promise.resolve({
        data: filtered[0] ?? null,
        error: filtered[0] ? null : { message: 'not found' },
      }),
      then: (resolveFn: (v: { data: unknown[]; error: null }) => void) =>
        Promise.resolve({ data: resolveRows(), error: null }).then(resolveFn),
    }
    return chain
  }

  return {
    from: (table: string) => makeQueryChain(tables[table] ?? []),
  } as unknown as SupabaseClient<Database>
}

// ── T10: loved_recipe_ids includes make_again=true entries ────────────────────

describe('deriveTasteProfile', () => {
  it('T10: loved_recipe_ids includes make_again=true entries', async () => {
    const db = makeDb({
      user_preferences: [{ avoided_tags: [], preferred_tags: [], meal_context: null }],
      recipe_history: [
        { recipe_id: 'r1', made_on: daysAgo(10), make_again: true },
        { recipe_id: 'r2', made_on: daysAgo(10), make_again: false },
        { recipe_id: 'r1', recipes: { tags: [] } },
      ],
    })
    const profile = await deriveTasteProfile('user-1', db, null)
    expect(profile.loved_recipe_ids).toContain('r1')
    expect(profile.disliked_recipe_ids).toContain('r2')
  })

  // ── T11: implicit love via 3+ cooks in 6 months ───────────────────────────

  it('T11: loved_recipe_ids includes recipes made 3+ times in 6 months', async () => {
    const threshold = IMPLICIT_LOVE_THRESHOLD // 3
    const db = makeDb({
      user_preferences: [{ avoided_tags: [], preferred_tags: [], meal_context: null }],
      recipe_history: [
        // r1: cooked exactly threshold times → should be implicitly loved
        ...Array.from({ length: threshold }, (_, i) => ({ recipe_id: 'r1', made_on: daysAgo(5 + i), make_again: null })),
        // r2: cooked threshold-1 times → should NOT be implicitly loved
        ...Array.from({ length: threshold - 1 }, (_, i) => ({ recipe_id: 'r2', made_on: daysAgo(5 + i), make_again: null })),
        // dummy for tags join
        { recipe_id: 'r1', recipes: { tags: [] } },
        { recipe_id: 'r2', recipes: { tags: [] } },
      ],
    })
    const profile = await deriveTasteProfile('user-1', db, null)
    expect(profile.loved_recipe_ids).toContain('r1')
    expect(profile.loved_recipe_ids).not.toContain('r2')
  })

  // ── T12: disliked_recipe_ids includes make_again=false entries ────────────

  it('T12: disliked_recipe_ids includes make_again=false entries', async () => {
    const db = makeDb({
      user_preferences: [{ avoided_tags: [], preferred_tags: [], meal_context: null }],
      recipe_history: [
        { recipe_id: 'r3', made_on: daysAgo(20), make_again: false },
        { recipe_id: 'r3', recipes: { tags: [] } },
      ],
    })
    const profile = await deriveTasteProfile('user-1', db, null)
    expect(profile.disliked_recipe_ids).toContain('r3')
  })

  // ── T13: top_tags weighted correctly (last 30d = 3×) ─────────────────────

  it('T13: top_tags — last-30d entries get 3× weight vs older entries', async () => {
    const db = makeDb({
      user_preferences: [{ avoided_tags: [], preferred_tags: [], meal_context: null }],
      recipe_history: [
        // tagA: one old entry (1×)
        { recipe_id: 'r1', made_on: daysAgo(120), make_again: null, recipes: { tags: ['tagA'] } },
        // tagB: one recent entry (3×)
        { recipe_id: 'r2', made_on: daysAgo(10), make_again: null, recipes: { tags: ['tagB'] } },
      ],
    })
    const profile = await deriveTasteProfile('user-1', db, null)
    const tagBIdx = profile.top_tags.indexOf('tagB')
    const tagAIdx = profile.top_tags.indexOf('tagA')
    // tagB should rank higher than tagA because 3× > 1×
    expect(tagBIdx).toBeGreaterThanOrEqual(0)
    expect(tagAIdx).toBeGreaterThanOrEqual(0)
    expect(tagBIdx).toBeLessThan(tagAIdx)
  })

  // ── T14: cooking_frequency buckets ────────────────────────────────────────

  it('T14: cooking_frequency = light for 0–2 distinct recipes in last 30d', async () => {
    const db = makeDb({
      user_preferences: [{ avoided_tags: [], preferred_tags: [], meal_context: null }],
      recipe_history: [
        { recipe_id: 'r1', made_on: daysAgo(5), make_again: null, recipes: { tags: [] } },
      ],
    })
    const profile = await deriveTasteProfile('user-1', db, null)
    expect(profile.cooking_frequency).toBe('light')
  })

  it('T14: cooking_frequency = moderate for 3–6 distinct recipes in last 30d', async () => {
    const db = makeDb({
      user_preferences: [{ avoided_tags: [], preferred_tags: [], meal_context: null }],
      recipe_history: [
        { recipe_id: 'r1', made_on: daysAgo(2), make_again: null, recipes: { tags: [] } },
        { recipe_id: 'r2', made_on: daysAgo(3), make_again: null, recipes: { tags: [] } },
        { recipe_id: 'r3', made_on: daysAgo(4), make_again: null, recipes: { tags: [] } },
        { recipe_id: 'r4', made_on: daysAgo(5), make_again: null, recipes: { tags: [] } },
      ],
    })
    const profile = await deriveTasteProfile('user-1', db, null)
    expect(profile.cooking_frequency).toBe('moderate')
  })

  it('T14: cooking_frequency = frequent for 7+ distinct recipes in last 30d', async () => {
    const db = makeDb({
      user_preferences: [{ avoided_tags: [], preferred_tags: [], meal_context: null }],
      recipe_history: Array.from({ length: 8 }, (_, i) => ({
        recipe_id: `r${i}`,
        made_on: daysAgo(i + 1),
        make_again: null,
        recipes: { tags: [] },
      })),
    })
    const profile = await deriveTasteProfile('user-1', db, null)
    expect(profile.cooking_frequency).toBe('frequent')
  })

  // ── T15: recent_recipes ───────────────────────────────────────────────────

  it('T15: recent_recipes returns up to 10 entries', async () => {
    const db = makeDb({
      user_preferences: [{ avoided_tags: [], preferred_tags: [], meal_context: null }],
      recipe_history: Array.from({ length: 12 }, (_, i) => ({
        recipe_id: `r${i}`,
        made_on: daysAgo(i + 1),
        make_again: null,
        recipes: { tags: [], title: `Recipe ${i}` },
      })),
    })
    const profile = await deriveTasteProfile('user-1', db, null)
    expect(profile.recent_recipes.length).toBeLessThanOrEqual(10)
  })

  // ── T16: empty history ────────────────────────────────────────────────────

  it('T16: empty history returns empty arrays and no error', async () => {
    const db = makeDb({
      user_preferences: [],
      recipe_history: [],
    })
    const profile = await deriveTasteProfile('user-1', db, null)
    expect(profile.loved_recipe_ids).toEqual([])
    expect(profile.disliked_recipe_ids).toEqual([])
    expect(profile.top_tags).toEqual([])
    expect(profile.recent_recipes).toEqual([])
    expect(profile.cooking_frequency).toBe('light')
  })

  // ── T22: household — aggregate history from all member user IDs ───────────

  it('T22: household mode aggregates history from all member user IDs', async () => {
    // With ctx, deriveTasteProfile should query household_members first,
    // then use all member IDs for history queries.
    // We verify by checking that a make_again=true entry from another member is included.
    const db = makeDb({
      household_members: [{ user_id: 'user-1' }, { user_id: 'user-2' }],
      user_preferences: [{ avoided_tags: [], preferred_tags: [], meal_context: null }],
      recipe_history: [
        { recipe_id: 'r99', made_on: daysAgo(10), make_again: true },
        { recipe_id: 'r99', recipes: { tags: [] } },
      ],
    })
    const profile = await deriveTasteProfile('user-1', db, { householdId: 'hh-1', role: 'owner' })
    expect(profile.loved_recipe_ids).toContain('r99')
  })
})
