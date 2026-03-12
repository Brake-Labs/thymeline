import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockState = {
  user: null as { id: string } | null,
  onboarding_completed: false,
  recipeCount: 0,
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
    from: (table: string) => {
      if (table === 'recipes') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ count: mockState.recipeCount, error: null }),
          }),
        }
      }
      // user_preferences
      return {
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
      }
    },
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
  mockState.recipeCount = 0
  mockState.updateError = null
})

describe('POST /api/auth/reactivate', () => {
  it('returns 200 when onboarding_completed = true', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 200 when onboarding_completed = false but user has recipes (corrupted account)', async () => {
    mockState.onboarding_completed = false
    mockState.recipeCount = 3
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
  })

  it('returns 403 when onboarding_completed = false and no recipes (legitimately inactive)', async () => {
    mockState.onboarding_completed = false
    mockState.recipeCount = 0
    const res = await POST(makeReq())
    expect(res.status).toBe(403)
  })

  it('returns 401 when not authenticated', async () => {
    mockState.user = null
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 500 when DB update fails', async () => {
    mockState.updateError = { message: 'connection error' }
    const res = await POST(makeReq())
    expect(res.status).toBe(500)
  })
})
