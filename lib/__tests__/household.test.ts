import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HouseholdContext } from '@/types'

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

// Import after mocking
import { scopeCondition, scopeInsert, checkOwnership } from '../household'

// ── scopeCondition ─────────────────────────────────────────────────────────────

describe('scopeCondition', () => {
  it('returns a condition for user_id when ctx is null (solo user)', () => {
    const columns = {
      userId: { name: 'user_id' },
      householdId: { name: 'household_id' },
    }
    // scopeCondition returns a Drizzle SQL condition object
    const result = scopeCondition(columns as never, 'user-1', null)
    // The result should be a SQL condition — just verify it's defined
    expect(result).toBeDefined()
  })

  it('returns a condition for household_id when ctx is set', () => {
    const columns = {
      userId: { name: 'user_id' },
      householdId: { name: 'household_id' },
    }
    const ctx: HouseholdContext = { householdId: 'h1', role: 'owner' }
    const result = scopeCondition(columns as never, 'user-1', ctx)
    expect(result).toBeDefined()
  })
})

// ── scopeInsert ─────────────────────────────────────────────────────────────────

describe('scopeInsert', () => {
  it('returns { userId } for solo user (ctx = null)', () => {
    const result = scopeInsert('user-1', null)
    expect(result).toEqual({ userId: 'user-1' })
  })

  it('returns { userId, householdId } for household user', () => {
    const ctx: HouseholdContext = { householdId: 'h1', role: 'member' }
    const result = scopeInsert('user-2', ctx)
    expect(result).toEqual({ userId: 'user-2', householdId: 'h1' })
  })
})

// ── checkOwnership ──────────────────────────────────────────────────────────────

describe('checkOwnership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns { owned: false, status: 404 } when record is not found', async () => {
    const chain = mockChain([])
    mockDb.select.mockReturnValue(chain)

    const result = await checkOwnership('recipes', 'r1', 'user-1', null)
    expect(result).toEqual({ owned: false, status: 404 })
  })

  it('returns { owned: false, status: 403 } when ctx is set and householdId does not match', async () => {
    const chain = mockChain([{ userId: 'user-1', householdId: 'h-other' }])
    mockDb.select.mockReturnValue(chain)
    const ctx: HouseholdContext = { householdId: 'h1', role: 'owner' }

    const result = await checkOwnership('recipes', 'r1', 'user-1', ctx)
    expect(result).toEqual({ owned: false, status: 403 })
  })

  it('returns { owned: false, status: 403 } when no ctx and userId does not match', async () => {
    const chain = mockChain([{ userId: 'other-user', householdId: null }])
    mockDb.select.mockReturnValue(chain)

    const result = await checkOwnership('recipes', 'r1', 'user-1', null)
    expect(result).toEqual({ owned: false, status: 403 })
  })

  it('returns { owned: true } when ctx is set and householdId matches', async () => {
    const chain = mockChain([{ userId: 'user-1', householdId: 'h1' }])
    mockDb.select.mockReturnValue(chain)
    const ctx: HouseholdContext = { householdId: 'h1', role: 'member' }

    const result = await checkOwnership('recipes', 'r1', 'user-1', ctx)
    expect(result).toEqual({ owned: true })
  })

  it('returns { owned: true } when no ctx and userId matches', async () => {
    const chain = mockChain([{ userId: 'user-1', householdId: null }])
    mockDb.select.mockReturnValue(chain)

    const result = await checkOwnership('recipes', 'r1', 'user-1', null)
    expect(result).toEqual({ owned: true })
  })

  it('returns { owned: false, status: 404 } for unknown table names', async () => {
    const result = await checkOwnership('nonexistent_table', 'r1', 'user-1', null)
    expect(result).toEqual({ owned: false, status: 404 })
  })
})
