/**
 * Regression tests for getSessionUser (regression #332)
 * Verifies that a throwing auth.api.getSession never propagates — it returns null
 * so that callers (e.g. the (app) layout) redirect to /login instead of 404/500.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

describe('getSessionUser (regression #332)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns null when auth.api.getSession throws (e.g. malformed cookie after sign-out)', async () => {
    const { auth } = await import('@/lib/auth-server')
    vi.mocked(auth.api.getSession).mockRejectedValue(new Error('invalid token'))

    const { getSessionUser } = await import('@/lib/auth-helpers')
    const result = await getSessionUser()
    expect(result).toBeNull()
  })

  it('returns null when session has no user', async () => {
    const { auth } = await import('@/lib/auth-server')
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)

    const { getSessionUser } = await import('@/lib/auth-helpers')
    const result = await getSessionUser()
    expect(result).toBeNull()
  })

  it('returns the session user when session is valid', async () => {
    const { auth } = await import('@/lib/auth-server')
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'u1', email: 'test@example.com', name: 'Test', image: null },
      session: {},
    } as never)

    const { getSessionUser } = await import('@/lib/auth-helpers')
    const result = await getSessionUser()
    expect(result).toEqual({ id: 'u1', email: 'test@example.com', name: 'Test', image: null })
  })
})
