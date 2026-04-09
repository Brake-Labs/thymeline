/* eslint-disable @typescript-eslint/no-explicit-any -- mock chain types */
/**
 * Tests for admin API routes.
 * Covers: GET /api/admin/users, POST /api/admin/users/invite,
 * POST /api/admin/users/[id]/disable, POST /api/admin/users/[id]/enable,
 * GET /api/admin/usage, GET /api/admin/stats
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared mock setup ────────────────────────────────────────────────────────

const mockAdminEmails = ['admin@example.com']
const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockUpdate = vi.fn()

function mockDbChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  for (const m of [
    'from', 'select', 'where', 'limit', 'orderBy', 'groupBy',
    'values', 'set', 'onConflictDoNothing', 'returning', 'innerJoin', 'leftJoin',
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) =>
    Promise.resolve(result).then(resolve),
  )
  return chain
}

vi.mock('@/lib/auth-server', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}))

vi.mock('@/lib/db/schema', () => ({
  user: { id: 'id', name: 'name', email: 'email', image: 'image', createdAt: 'created_at' },
  recipes: { userId: 'user_id' },
  allowedUsers: { id: 'id', email: 'email', disabledAt: 'disabled_at', addedBy: 'added_by' },
  llmUsage: { userId: 'user_id', feature: 'feature', inputTokens: 'input_tokens', outputTokens: 'output_tokens', createdAt: 'created_at' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(() => ({ as: vi.fn().mockReturnValue('sql_alias') })),
  gte: vi.fn(),
  isNull: vi.fn(),
  count: vi.fn(),
  sum: vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/request-context', () => ({
  withRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}))

vi.mock('@/lib/config', () => ({
  config: {
    get allowedEmails() { return [] },
    get adminEmails() { return mockAdminEmails },
    get siteUrl() { return 'http://localhost:3000' },
  },
}))

// Simulate dev bypass for admin access
beforeEach(() => {
  vi.clearAllMocks()
  process.env.DEV_BYPASS_AUTH = 'true'
  // @ts-expect-error -- vitest allows NODE_ENV assignment
  process.env.NODE_ENV = 'test'
  process.env.DEV_BYPASS_AUTH_EMAIL = 'admin@example.com'
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/admin/stats', () => {
  it('returns summary stats', async () => {
    // Each select() call returns a chained query
    mockSelect
      .mockReturnValueOnce(mockDbChain([{ count: 5 }]))
      .mockReturnValueOnce(mockDbChain([{ count: 42 }]))
      .mockReturnValueOnce(mockDbChain([{ totalTokens: 1234 }]))
      .mockReturnValueOnce(mockDbChain([{ count: 3 }]))

    const { GET } = await import('../../admin/stats/route')
    const req = new Request('http://localhost:3000/api/admin/stats')
    const res = await GET(req as any)

    expect(res.status).toBe(200)
  })
})

describe('GET /api/admin/users', () => {
  it('returns users list', async () => {
    mockSelect
      .mockReturnValueOnce(mockDbChain([
        { id: 'u1', name: 'Test', email: 'test@x.com', image: null, createdAt: new Date() },
      ]))
      .mockReturnValueOnce(mockDbChain([{ userId: 'u1', count: 10 }]))
      .mockReturnValueOnce(mockDbChain([{ userId: 'u1', totalTokens: 500 }]))
      .mockReturnValueOnce(mockDbChain([{ email: 'test@x.com', disabledAt: null }]))

    const { GET } = await import('../../admin/users/route')
    const req = new Request('http://localhost:3000/api/admin/users')
    const res = await GET(req as any)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.users).toHaveLength(1)
    expect(body.users[0].recipeCount).toBe(10)
  })
})

describe('POST /api/admin/users/invite', () => {
  it('invites a new user by email', async () => {
    mockInsert.mockReturnValue(mockDbChain([{ id: '1' }]))

    const { POST } = await import('../../admin/users/invite/route')
    const req = new Request('http://localhost:3000/api/admin/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com' }),
    })
    const res = await POST(req as any)

    expect(res.status).toBe(201)
  })

  it('returns 400 for missing email', async () => {
    const { POST } = await import('../../admin/users/invite/route')
    const req = new Request('http://localhost:3000/api/admin/users/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req as any)

    expect(res.status).toBe(400)
  })
})

describe('POST /api/admin/users/[id]/disable', () => {
  it('disables a user by looking up email from user table', async () => {
    // First select: user email lookup
    mockSelect.mockReturnValueOnce(mockDbChain([{ email: 'test@x.com' }]))
    // update → set → where → returning chain
    mockUpdate.mockReturnValue(mockDbChain([{ id: 'au1', email: 'test@x.com', disabledAt: new Date() }]))

    const { POST } = await import('../../admin/users/[id]/disable/route')
    const req = new Request('http://localhost:3000/api/admin/users/u1/disable', { method: 'POST' })
    const res = await POST(req as any, { params: { id: 'u1' } })

    expect(res.status).toBe(200)
  })

  it('returns 404 when user ID does not exist', async () => {
    mockSelect.mockReturnValueOnce(mockDbChain([]))

    const { POST } = await import('../../admin/users/[id]/disable/route')
    const req = new Request('http://localhost:3000/api/admin/users/bad/disable', { method: 'POST' })
    const res = await POST(req as any, { params: { id: 'bad' } })

    expect(res.status).toBe(404)
  })
})

describe('POST /api/admin/users/[id]/enable', () => {
  it('enables a disabled user', async () => {
    mockSelect.mockReturnValueOnce(mockDbChain([{ email: 'test@x.com' }]))
    mockUpdate.mockReturnValue(mockDbChain([{ id: 'au1', email: 'test@x.com', disabledAt: null }]))

    const { POST } = await import('../../admin/users/[id]/enable/route')
    const req = new Request('http://localhost:3000/api/admin/users/u1/enable', { method: 'POST' })
    const res = await POST(req as any, { params: { id: 'u1' } })

    expect(res.status).toBe(200)
  })

  it('returns 404 when user not in allowed list', async () => {
    mockSelect.mockReturnValueOnce(mockDbChain([{ email: 'test@x.com' }]))
    mockUpdate.mockReturnValue(mockDbChain([]))

    const { POST } = await import('../../admin/users/[id]/enable/route')
    const req = new Request('http://localhost:3000/api/admin/users/u1/enable', { method: 'POST' })
    const res = await POST(req as any, { params: { id: 'u1' } })

    expect(res.status).toBe(404)
  })
})

describe('GET /api/admin/usage', () => {
  it('returns usage data with default 7d range', async () => {
    mockSelect
      .mockReturnValueOnce(mockDbChain([{ feature: 'discover', totalTokens: 1000 }]))
      .mockReturnValueOnce(mockDbChain([{ userId: 'u1', totalTokens: 800 }]))

    const { GET } = await import('../../admin/usage/route')
    const req = new Request('http://localhost:3000/api/admin/usage?range=7d')
    const res = await GET(req as any)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.byFeature).toBeDefined()
    expect(body.byUser).toBeDefined()
  })
})
