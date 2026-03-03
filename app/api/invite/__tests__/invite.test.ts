import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock state for validate ───────────────────────────────────────────────────
const validateMockState = {
  invite: null as { used_by: string | null; expires_at: string } | null,
  lookupError: null as { message: string } | null,
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: validateMockState.invite,
            error: validateMockState.lookupError,
          }),
        }),
      }),
    }),
  }),
}))

// ── Mock state for consume ────────────────────────────────────────────────────
const consumeMockState = {
  user: null as { id: string } | null,
  invite: null as { id: string; used_by: string | null; expires_at: string } | null,
  lookupError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  prefsUpdateCalled: false,
}

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: consumeMockState.user },
        error: consumeMockState.user ? null : { message: 'no user' },
      }),
    },
    from: (table: string) => {
      if (table === 'user_preferences') {
        return {
          update: () => ({
            eq: async () => {
              consumeMockState.prefsUpdateCalled = true
              return { error: null }
            },
          }),
        }
      }
      // invites table
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: consumeMockState.invite,
              error: consumeMockState.lookupError,
            }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: consumeMockState.updateError }),
        }),
      }
    },
  }),
}))

const { GET: validateGET } = await import('@/app/api/invite/validate/route')
const { POST: consumePOST } = await import('@/app/api/invite/consume/route')

// ── T13/T14: Invite validation ────────────────────────────────────────────────
describe('GET /api/invite/validate', () => {
  beforeEach(() => {
    validateMockState.invite = null
    validateMockState.lookupError = null
  })

  it('T13 - returns valid=true for a valid unused unexpired token', async () => {
    validateMockState.invite = {
      used_by: null,
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    }
    const req = new NextRequest('http://localhost/api/invite/validate?token=abc123')
    const res = await validateGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.valid).toBe(true)
  })

  it('T14 - returns valid=false for missing token', async () => {
    validateMockState.lookupError = { message: 'not found' }
    const req = new NextRequest('http://localhost/api/invite/validate?token=bad')
    const res = await validateGET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('Token not found')
  })

  it('T14 - returns valid=false with reason "Already used" for consumed token', async () => {
    validateMockState.invite = {
      used_by: 'some-user',
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    }
    const req = new NextRequest('http://localhost/api/invite/validate?token=used')
    const res = await validateGET(req)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('Already used')
  })

  it('T14 - returns valid=false with reason "Expired" for expired token', async () => {
    validateMockState.invite = {
      used_by: null,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    }
    const req = new NextRequest('http://localhost/api/invite/validate?token=expired')
    const res = await validateGET(req)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('Expired')
  })

  it('returns valid=false when no token query param provided', async () => {
    const req = new NextRequest('http://localhost/api/invite/validate')
    const res = await validateGET(req)
    const body = await res.json()
    expect(body.valid).toBe(false)
  })
})

// ── T15/T16/T21: Invite consumption ──────────────────────────────────────────
describe('POST /api/invite/consume', () => {
  function makeRequest(body: unknown) {
    return new NextRequest('http://localhost/api/invite/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify(body),
    })
  }

  beforeEach(() => {
    consumeMockState.user = { id: 'user-1' }
    consumeMockState.invite = null
    consumeMockState.lookupError = null
    consumeMockState.updateError = null
    consumeMockState.prefsUpdateCalled = false
  })

  it('T15 - returns success=true for a valid token and marks it used', async () => {
    consumeMockState.invite = {
      id: 'invite-1',
      used_by: null,
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    }
    const res = await consumePOST(makeRequest({ token: 'valid-token' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('T16 - returns success=false and sets is_active=false when token is null', async () => {
    const res = await consumePOST(makeRequest({ token: null }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.reason).toBe('No invite token')
    expect(consumeMockState.prefsUpdateCalled).toBe(true)
  })

  it('T16 - returns success=false and sets is_active=false when token not found', async () => {
    consumeMockState.lookupError = { message: 'not found' }
    const res = await consumePOST(makeRequest({ token: 'bad-token' }))
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.reason).toBe('Token not found')
    expect(consumeMockState.prefsUpdateCalled).toBe(true)
  })

  it('T21 - returns success=false when token is already used (second consumption)', async () => {
    consumeMockState.invite = {
      id: 'invite-1',
      used_by: 'another-user',
      expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    }
    const res = await consumePOST(makeRequest({ token: 'used-token' }))
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.reason).toBe('Already used')
    expect(consumeMockState.prefsUpdateCalled).toBe(true)
  })

  it('returns 401 when not authenticated', async () => {
    consumeMockState.user = null
    const res = await consumePOST(makeRequest({ token: 'any' }))
    expect(res.status).toBe(401)
  })
})
