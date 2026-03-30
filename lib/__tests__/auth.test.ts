/**
 * Tests for lib/auth.ts — the withAuth higher-order function.
 *
 * Covers:
 *  1. Returns 401 when getUser() returns an error
 *  2. Returns 401 when getUser() returns no user
 *  3. Calls handler with user, admin db, and household context on success
 *  4. Passes route params through from routeContext.params
 *  5. Passes empty params when routeContext is undefined
 *  6. Passes null ctx when resolveHouseholdScope returns null
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockUser = { id: 'user-1', email: 'test@example.com' }

const mockHouseholdCtx = { householdId: 'hh-1', role: 'owner' as const }

const mockState = {
  user: mockUser as typeof mockUser | null,
  authError: null as { message: string } | null,
  householdCtx: mockHouseholdCtx as typeof mockHouseholdCtx | null,
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAdminDb = { from: vi.fn() }

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: mockState.user },
        error: mockState.authError,
      }),
    },
  }),
  createAdminClient: () => mockAdminDb,
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn(async () => mockState.householdCtx),
}))

import { resolveHouseholdScope } from '@/lib/household'
import { withAuth } from '@/lib/auth'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(method = 'GET'): NextRequest {
  return new NextRequest('http://localhost/test', {
    method,
    headers: { Authorization: 'Bearer token' },
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('withAuth', () => {
  beforeEach(() => {
    mockState.user = mockUser
    mockState.authError = null
    mockState.householdCtx = mockHouseholdCtx
    vi.clearAllMocks()
  })

  it('returns 401 when getUser() returns an error', async () => {
    mockState.user = null
    mockState.authError = { message: 'invalid token' }

    const handler = vi.fn()
    const wrapped = withAuth(handler)
    const res = await wrapped(makeReq())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns 401 when getUser() returns no user', async () => {
    mockState.user = null
    mockState.authError = null

    const handler = vi.fn()
    const wrapped = withAuth(handler)
    const res = await wrapped(makeReq())

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('calls handler with user, admin db, and household context on success', async () => {
    const handlerResponse = NextResponse.json({ ok: true })
    const handler = vi.fn().mockResolvedValue(handlerResponse)

    const wrapped = withAuth(handler)
    const req = makeReq()
    const res = await wrapped(req, { params: {} })

    expect(handler).toHaveBeenCalledOnce()
    const [passedReq, auth, params] = handler.mock.calls[0]!

    expect(passedReq).toBe(req)
    expect(auth.user).toBe(mockUser)
    expect(auth.db).toBe(mockAdminDb)
    expect(auth.ctx).toEqual(mockHouseholdCtx)
    expect(params).toEqual({})

    expect(resolveHouseholdScope).toHaveBeenCalledWith(mockAdminDb, mockUser.id)
    expect(res).toBe(handlerResponse)
  })

  it('passes route params through from routeContext.params', async () => {
    const handlerResponse = NextResponse.json({ ok: true })
    const handler = vi.fn().mockResolvedValue(handlerResponse)

    const wrapped = withAuth(handler)
    const routeParams = { id: 'recipe-42', slug: 'test-slug' }
    await wrapped(makeReq(), { params: routeParams })

    expect(handler).toHaveBeenCalledOnce()
    const [, , params] = handler.mock.calls[0]!
    expect(params).toEqual(routeParams)
  })

  it('passes empty params when routeContext is undefined', async () => {
    const handlerResponse = NextResponse.json({ ok: true })
    const handler = vi.fn().mockResolvedValue(handlerResponse)

    const wrapped = withAuth(handler)
    await wrapped(makeReq())

    expect(handler).toHaveBeenCalledOnce()
    const [, , params] = handler.mock.calls[0]!
    expect(params).toEqual({})
  })

  it('passes null ctx when resolveHouseholdScope returns null', async () => {
    mockState.householdCtx = null

    const handlerResponse = NextResponse.json({ ok: true })
    const handler = vi.fn().mockResolvedValue(handlerResponse)

    const wrapped = withAuth(handler)
    await wrapped(makeReq(), { params: {} })

    expect(handler).toHaveBeenCalledOnce()
    const [, auth] = handler.mock.calls[0]!
    expect(auth.ctx).toBeNull()
  })
})
