import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock state ────────────────────────────────────────────────────────────────
const mockState = {
  user: null as { id: string } | null,
  insertError: null as { message: string } | null,
}

const mockConfig = {
  adminUserId: 'admin-uuid' as string | undefined,
  siteUrl: 'https://example.com',
}

const makeMockFrom = () => ({
  insert: async () => ({ error: mockState.insertError }),
})

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: mockState.user },
        error: mockState.user ? null : { message: 'no user' },
      }),
    },
    from: makeMockFrom,
  }),
  createAdminClient: () => ({ from: makeMockFrom }),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: async () => null,
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
  scopeQuery: (query: any, userId: string, ctx: any) => {
    if (ctx) return query.eq('household_id', ctx.householdId)
    return query.eq('user_id', userId)
  },
}))

vi.mock('@/lib/config', () => ({
  config: {
    supabase: {
      url: 'http://localhost:54321',
      anonKey: 'test-anon-key',
      serviceRoleKey: 'test-service-role-key',
    },
    get admin() { return { userId: mockConfig.adminUserId } },
    get siteUrl() { return mockConfig.siteUrl },
  },
}))

const { POST } = await import('@/app/api/admin/invite/route')

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/invite', {
    method: 'POST',
    headers: { Authorization: 'Bearer admin-token' },
  })
}

beforeEach(() => {
  mockState.user = { id: 'admin-uuid' }
  mockState.insertError = null
  mockConfig.adminUserId = 'admin-uuid'
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
    mockState.user = { id: 'other-user-uuid' }
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
  })
})

// ── T20: POST /api/admin/invite returns 403 when ADMIN_USER_ID not set ───────
describe('T20 - POST /api/admin/invite returns 403 when ADMIN_USER_ID not set', () => {
  it('returns 403 when ADMIN_USER_ID is not configured', async () => {
    mockConfig.adminUserId = undefined
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
  })

  it('returns 403 when ADMIN_USER_ID is empty string', async () => {
    mockConfig.adminUserId = ''
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
