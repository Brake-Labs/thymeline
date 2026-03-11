import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockState = {
  user: null as { id: string } | null,
  onboarding_completed: false,
  updateError: null as { message: string } | null,
}

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: mockState.user },
        error: mockState.user ? null : { message: 'no user' },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { onboarding_completed: mockState.onboarding_completed },
            error: null,
          }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: mockState.updateError }),
      }),
    }),
  }),
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
  mockState.onboarding_completed = true
  mockState.updateError = null
})

describe('POST /api/auth/reactivate', () => {
  it('returns 200 and reactivates an onboarded user', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 401 when not authenticated', async () => {
    mockState.user = null
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 403 when onboarding_completed is false', async () => {
    mockState.onboarding_completed = false
    const res = await POST(makeReq())
    expect(res.status).toBe(403)
  })

  it('returns 500 when DB update fails', async () => {
    mockState.updateError = { message: 'connection error' }
    const res = await POST(makeReq())
    expect(res.status).toBe(500)
  })
})
