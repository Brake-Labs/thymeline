/**
 * Regression tests for GET /api/household (regression #355)
 * Verifies that the household API returns displayName and email for each member.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin',
    'leftJoin', 'set', 'values', 'returning', 'groupBy']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
  )
  return chain
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('@/lib/db/schema', () => ({
  households:      { id: 'id', name: 'name', ownerId: 'ownerId' },
  householdMembers: { householdId: 'householdId', userId: 'userId', role: 'role', joinedAt: 'joinedAt' },
  user:            { id: 'id', name: 'name', email: 'email' },
}))

vi.mock('@/lib/db/helpers', () => ({
  dbFirst: (rows: unknown[]) => rows[0] ?? null,
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue({ householdId: 'h-1', role: 'owner' }),
  canManage: () => true,
  scopeCondition: vi.fn().mockReturnValue({}),
  scopeInsert: vi.fn((userId: string) => ({ userId })),
}))

const MOCK_USER = { id: 'user-1', email: 'alice@example.com', name: 'Alice' }
const MOCK_HOUSEHOLD = { id: 'h-1', name: 'Test Household', ownerId: 'user-1' }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/household — member enrichment (regression #355)', () => {
  beforeEach(async () => {
    vi.resetModules()
    const { auth } = await import('@/lib/auth-server')
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: MOCK_USER } as never)
  })

  it('returns displayName and email for each member', async () => {
    const { db } = await import('@/lib/db')
    let selectCall = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++
      if (selectCall === 1) {
        // households query
        return mockChain([MOCK_HOUSEHOLD]) as never
      }
      // householdMembers JOIN user query
      return mockChain([
        {
          householdId: 'h-1',
          userId:      'user-1',
          role:        'owner',
          joinedAt:    new Date('2024-01-01'),
          displayName: 'Alice',
          email:       'alice@example.com',
        },
      ]) as never
    })

    const { GET } = await import('../route')
    const res = await GET(new NextRequest('http://localhost/api/household') as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.members).toHaveLength(1)
    expect(body.members[0].displayName).toBe('Alice')
    expect(body.members[0].email).toBe('alice@example.com')
    expect(body.members[0].userId).toBe('user-1')
  })

  it('returns undefined displayName and email when user row has nulls (new user)', async () => {
    const { db } = await import('@/lib/db')
    let selectCall = 0
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++
      if (selectCall === 1) return mockChain([MOCK_HOUSEHOLD]) as never
      return mockChain([
        {
          householdId: 'h-1',
          userId:      'user-2',
          role:        'member',
          joinedAt:    new Date('2024-06-01'),
          displayName: null,
          email:       null,
        },
      ]) as never
    })

    const { GET } = await import('../route')
    const res = await GET(new NextRequest('http://localhost/api/household') as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.members[0].displayName).toBeUndefined()
    expect(body.members[0].email).toBeUndefined()
  })

  it('returns null household when user is not in a household', async () => {
    const { resolveHouseholdScope } = await import('@/lib/household')
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce(null)

    const { GET } = await import('../route')
    const res = await GET(new NextRequest('http://localhost/api/household') as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.household).toBeNull()
  })
})
