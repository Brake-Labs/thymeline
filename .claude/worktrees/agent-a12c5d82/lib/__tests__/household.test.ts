import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { HouseholdContext } from '@/types'
import { scopeQuery, scopeInsert, checkOwnership } from '../household'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Creates a mock query builder that records `.eq()` calls for assertion. */
function mockQuery() {
  const calls: [string, string][] = []
  const q = {
    eq(col: string, val: string) {
      calls.push([col, val])
      return q
    },
  }
  return { q, calls }
}

/**
 * Creates a minimal mock Supabase client for checkOwnership.
 * The `.from().select().eq().single()` chain resolves to `{ data, error }`.
 */
function mockDb(data: unknown, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data, error }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

// ── scopeQuery ──────────────────────────────────────────────────────────────

describe('scopeQuery', () => {
  it('adds eq("user_id", userId) for solo user (ctx = null)', () => {
    const { q, calls } = mockQuery()

    scopeQuery(q, 'user-1', null)

    expect(calls).toEqual([['user_id', 'user-1']])
  })

  it('adds eq("household_id", householdId) for household user', () => {
    const { q, calls } = mockQuery()
    const ctx: HouseholdContext = { householdId: 'h1', role: 'owner' }

    scopeQuery(q, 'user-1', ctx)

    expect(calls).toEqual([['household_id', 'h1']])
  })

  it('returns the query builder for chaining', () => {
    const { q } = mockQuery()

    const result = scopeQuery(q, 'user-1', null)

    expect(result).toBe(q)
  })
})

// ── scopeInsert ─────────────────────────────────────────────────────────────

describe('scopeInsert', () => {
  it('returns payload + user_id for solo user (ctx = null)', () => {
    const payload = { title: 'Pasta', category: 'main_dish' }

    const result = scopeInsert('user-1', null, payload)

    expect(result).toEqual({
      title: 'Pasta',
      category: 'main_dish',
      user_id: 'user-1',
    })
  })

  it('returns payload + household_id + user_id for household user', () => {
    const ctx: HouseholdContext = { householdId: 'h1', role: 'member' }
    const payload = { title: 'Tacos' }

    const result = scopeInsert('user-2', ctx, payload)

    expect(result).toEqual({
      title: 'Tacos',
      household_id: 'h1',
      user_id: 'user-2',
    })
  })

  it('does not mutate the original payload', () => {
    const payload = { title: 'Soup' }
    const original = { ...payload }

    scopeInsert('user-1', null, payload)

    expect(payload).toEqual(original)
  })
})

// ── checkOwnership ──────────────────────────────────────────────────────────

describe('checkOwnership', () => {
  it('returns { owned: false, status: 404 } when record is not found', async () => {
    const db = mockDb(null, { code: 'PGRST116', message: 'not found' })

    const result = await checkOwnership(db, 'recipes', 'r1', 'user-1', null)

    expect(result).toEqual({ owned: false, status: 404 })
  })

  it('returns { owned: false, status: 404 } when data is null (no error)', async () => {
    const db = mockDb(null)

    const result = await checkOwnership(db, 'recipes', 'r1', 'user-1', null)

    expect(result).toEqual({ owned: false, status: 404 })
  })

  it('returns { owned: false, status: 403 } when ctx is set and household_id does not match', async () => {
    const db = mockDb({ user_id: 'user-1', household_id: 'h-other' })
    const ctx: HouseholdContext = { householdId: 'h1', role: 'owner' }

    const result = await checkOwnership(db, 'recipes', 'r1', 'user-1', ctx)

    expect(result).toEqual({ owned: false, status: 403 })
  })

  it('returns { owned: false, status: 403 } when no ctx and user_id does not match', async () => {
    const db = mockDb({ user_id: 'other-user', household_id: null })

    const result = await checkOwnership(db, 'recipes', 'r1', 'user-1', null)

    expect(result).toEqual({ owned: false, status: 403 })
  })

  it('returns { owned: true } when ctx is set and household_id matches', async () => {
    const db = mockDb({ user_id: 'user-1', household_id: 'h1' })
    const ctx: HouseholdContext = { householdId: 'h1', role: 'member' }

    const result = await checkOwnership(db, 'recipes', 'r1', 'user-1', ctx)

    expect(result).toEqual({ owned: true })
  })

  it('returns { owned: true } when no ctx and user_id matches', async () => {
    const db = mockDb({ user_id: 'user-1', household_id: null })

    const result = await checkOwnership(db, 'recipes', 'r1', 'user-1', null)

    expect(result).toEqual({ owned: true })
  })
})
