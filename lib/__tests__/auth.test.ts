import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn()
const mockSelect = vi.fn()

vi.mock('../auth-server', () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}))

vi.mock('../db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}))

vi.mock('../db/schema', () => ({
  allowedUsers: {
    id: 'id',
    email: 'email',
    disabledAt: 'disabled_at',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
}))

vi.mock('../household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
}))

vi.mock('../logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../request-context', () => ({
  withRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}))

let mockAllowedEmails: string[] = []
let mockAdminEmails: string[] = []

vi.mock('../config', () => ({
  config: {
    get allowedEmails() { return mockAllowedEmails },
    get adminEmails() { return mockAdminEmails },
  },
}))

function mockDbChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'where', 'limit', 'orderBy']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) =>
    Promise.resolve(result).then(resolve),
  )
  return chain
}

function makeRequest(path = '/api/test'): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'))
}

import { withAuth, withAdmin } from '../auth'

describe('withAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAllowedEmails = []
    mockAdminEmails = []
    delete process.env.DEV_BYPASS_AUTH
  })

  it('returns 401 when no session exists', async () => {
    mockGetSession.mockResolvedValue(null)
    const handler = vi.fn()
    const wrapped = withAuth(handler)
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('calls handler with user when session is valid', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'u1', email: 'test@example.com', name: 'Test', image: null },
    })
    // Mock the isEmailAllowed check: no env var entries, no DB entries = open access
    mockSelect.mockReturnValue(mockDbChain([]))

    const handler = vi.fn().mockResolvedValue(new Response('ok'))
    const wrapped = withAuth(handler)
    await wrapped(makeRequest())

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]?.[1].user.email).toBe('test@example.com')
  })

  it('returns 403 when email is not in allowed list', async () => {
    mockAllowedEmails = ['admin@example.com']
    mockGetSession.mockResolvedValue({
      user: { id: 'u1', email: 'blocked@example.com', name: 'B', image: null },
    })
    // DB check also returns empty (not in DB)
    mockSelect.mockReturnValue(mockDbChain([]))

    const handler = vi.fn()
    const wrapped = withAuth(handler)
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it('uses dev user when DEV_BYPASS_AUTH is set', async () => {
    process.env.DEV_BYPASS_AUTH = 'true'
    // @ts-expect-error -- vitest allows NODE_ENV assignment
    process.env.NODE_ENV = 'test'

    const handler = vi.fn().mockResolvedValue(new Response('ok'))
    const wrapped = withAuth(handler)
    await wrapped(makeRequest())

    expect(handler).toHaveBeenCalledTimes(1)
    expect(mockGetSession).not.toHaveBeenCalled()
  })
})

describe('withAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAllowedEmails = []
    mockAdminEmails = ['admin@example.com']
    process.env.DEV_BYPASS_AUTH = 'true'
    // @ts-expect-error -- vitest allows NODE_ENV assignment
    process.env.NODE_ENV = 'test'
  })

  it('returns 403 when user is not an admin', async () => {
    // Dev bypass user email won't match admin list
    const handler = vi.fn()
    const wrapped = withAdmin(handler)
    const res = await wrapped(makeRequest())

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Admin access required')
    expect(handler).not.toHaveBeenCalled()
  })

  it('calls handler when user is an admin', async () => {
    // Use mock session instead of dev bypass since DEV_USER is computed at module load
    delete process.env.DEV_BYPASS_AUTH
    mockGetSession.mockResolvedValue({
      user: { id: 'u1', email: 'admin@example.com', name: 'Admin', image: null },
    })
    // Mock the isEmailAllowed DB check to return empty (open access)
    mockSelect.mockReturnValue(mockDbChain([]))

    const handler = vi.fn().mockResolvedValue(new Response('ok'))
    const wrapped = withAdmin(handler)
    await wrapped(makeRequest())

    expect(handler).toHaveBeenCalledTimes(1)
  })
})
