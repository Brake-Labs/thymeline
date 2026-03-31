import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockState = {
  user: null as { id: string } | null,
  rowExists: true,  // whether user_preferences row exists
  rowError: null as { code?: string; message: string } | null,
  updateError: null as { message: string } | null,
}

const makeMockFrom = () => ({
  select: () => ({
    eq: () => ({
      single: async () => {
        if (mockState.rowError) return { data: null, error: mockState.rowError }
        if (!mockState.rowExists) return { data: null, error: { code: 'PGRST116', message: 'not found' } }
        return { data: { user_id: 'user-1' }, error: null }
      },
    }),
  }),
  update: () => ({
    eq: async () => ({ error: mockState.updateError }),
  }),
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
}))

const { POST } = await import('@/app/api/auth/reactivate/route')

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/auth/reactivate', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
  })
}

beforeEach(() => {
  mockState.user = { id: 'user-1' }
  mockState.rowExists = true
  mockState.rowError = null
  mockState.updateError = null
})

describe('POST /api/auth/reactivate', () => {
  it('returns 200 when a preferences row exists (provisioned user)', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 200 for corrupted account (onboarding_completed=false, is_active=false) — row still exists', async () => {
    // Row exists regardless of its contents — that is the only signal needed
    mockState.rowExists = true
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
  })

  it('returns 403 when no preferences row exists (never provisioned)', async () => {
    mockState.rowExists = false
    const res = await POST(makeReq())
    expect(res.status).toBe(403)
  })

  it('returns 401 when not authenticated', async () => {
    mockState.user = null
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 500 when row SELECT fails with a non-PGRST116 error', async () => {
    mockState.rowError = { code: '42501', message: 'permission denied' }
    const res = await POST(makeReq())
    expect(res.status).toBe(500)
  })

  it('returns 500 when DB update fails', async () => {
    mockState.updateError = { message: 'connection error' }
    const res = await POST(makeReq())
    expect(res.status).toBe(500)
  })
})
