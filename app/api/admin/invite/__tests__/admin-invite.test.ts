import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock state ────────────────────────────────────────────────────────────────
const mockState = {
  user: null as { id: string; email: string; name: string; image: null } | null,
  insertError: null as { message: string } | null,
}

const mockConfig = {
  adminEmails: ['admin@example.com'] as string[],
  siteUrl: 'https://example.com',
}

// ── Mock chain builder ───────────────────────────────────────────────────────

function mockChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  for (const m of ['from','where','orderBy','limit','offset','innerJoin','leftJoin','set','values','onConflictDoUpdate','onConflictDoNothing','returning','groupBy']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve))
  return chain
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => mockChain()),
    insert: vi.fn(() => mockChain()),
    update: vi.fn(() => mockChain()),
    delete: vi.fn(() => mockChain()),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

vi.mock('@/lib/auth-server', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => mockState.user ? {
        user: mockState.user,
        session: { id: 'sess-1', createdAt: new Date(), updatedAt: new Date(), userId: mockState.user!.id, expiresAt: new Date(Date.now() + 86400000), token: 'tok' },
      } : null),
    },
  },
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  scopeCondition: vi.fn().mockReturnValue({}),
  scopeInsert: vi.fn((userId: string) => ({ userId })),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
}))

vi.mock('@/lib/config', () => ({
  config: {
    get adminEmails() { return mockConfig.adminEmails },
    get siteUrl() { return mockConfig.siteUrl },
    get allowedEmails() { return [] },
  },
}))

const { POST } = await import('@/app/api/admin/invite/route')

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/invite', {
    method: 'POST',
  })
}

beforeEach(() => {
  mockState.user = { id: 'admin-uuid', email: 'admin@example.com', name: 'Admin', image: null }
  mockState.insertError = null
  mockConfig.adminEmails = ['admin@example.com']
  mockConfig.siteUrl = 'https://example.com'
})

// ── T18: POST /api/admin/invite returns invite URL for admin ──────────────────
describe('T18 - POST /api/admin/invite returns invite URL for admin', () => {
  it('returns 200 with invite_url and expires_at for admin user', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.invite_url).toMatch(/^https:\/\/example\.com\/invite\?token=/)
    expect(body.expires_at).toBeDefined()
    // expires_at should be ~7 days in the future
    const diff = new Date(body.expires_at).getTime() - Date.now()
    expect(diff).toBeGreaterThan(6 * 24 * 60 * 60 * 1000)
    expect(diff).toBeLessThan(8 * 24 * 60 * 60 * 1000)
  })
})

// ── T19: POST /api/admin/invite returns 403 for non-admin user ───────────────
describe('T19 - POST /api/admin/invite returns 403 for non-admin', () => {
  it('returns 403 when user is not the admin', async () => {
    mockState.user = { id: 'other-user-uuid', email: 'other@example.com', name: 'Other', image: null }
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
  })
})

// ── T20: POST /api/admin/invite returns 403 when ADMIN_EMAILS not set ───────
describe('T20 - POST /api/admin/invite returns 403 when ADMIN_EMAILS not set', () => {
  it('returns 403 when ADMIN_EMAILS is empty', async () => {
    mockConfig.adminEmails = []
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
  })
})

describe('GET /api/admin/invite - unauthenticated', () => {
  it('returns 401 when not authenticated', async () => {
    mockState.user = null
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })
})
