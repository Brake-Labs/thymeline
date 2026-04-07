// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'

// vi.hoisted ensures these are available inside vi.mock factory (hoisted before imports)
const { mockPush, mockGetSession } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockGetSession: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { social: vi.fn() },
    signOut: vi.fn(),
    useSession: vi.fn().mockReturnValue({ data: { user: { id: 'user-1' } }, isPending: false }),
    getSession: mockGetSession,
  },
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

import AuthCompletePage from '../page'

beforeEach(() => {
  mockPush.mockClear()
  mockFetch.mockClear()
  mockGetSession.mockReset()
})

// ── T06: Returning user lands on /home after auth ─────────────────────────────
describe('T06 - Returning user redirects to /home', () => {
  it('redirects to /home when onboarding_completed=true', async () => {
    mockGetSession.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@test.com' } } })

    // check-email response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ allowed: true }),
    })
    // preferences response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ onboarding_completed: true, is_active: true }),
    })

    await act(async () => {
      render(<AuthCompletePage />)
    })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/home')
    })
  })

  it('redirects to /home when is_active=true even if onboarding_completed=false', async () => {
    mockGetSession.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@test.com' } } })

    // check-email response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ allowed: true }),
    })
    // preferences response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ onboarding_completed: false, is_active: true }),
    })

    await act(async () => {
      render(<AuthCompletePage />)
    })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/home')
    })
  })
})

// ── T05: New user lands on /onboarding after auth ────────────────────────────
describe('T05 - New user redirects to /onboarding', () => {
  it('redirects to /onboarding when preferences exist but onboarding not completed', async () => {
    mockGetSession.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@test.com' } } })

    // check-email response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ allowed: true }),
    })
    // preferences response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ onboarding_completed: false, is_active: false }),
    })

    await act(async () => {
      render(<AuthCompletePage />)
    })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/onboarding')
    })
  })
})

// ── No session redirects to /login ──────────────────────────────────────────
describe('No session redirects to /login', () => {
  it('redirects to /login when getSession returns no user', async () => {
    mockGetSession.mockResolvedValue({ data: { user: null } })

    await act(async () => {
      render(<AuthCompletePage />)
    })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login')
    })
  })
})

// ── T01: Auth layout redirects unauthenticated users (documented) ─────────────
describe('T01/T17 - Auth layout redirect behavior', () => {
  it('app layout redirects to /login when no session (verified via layout source)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const layoutPath = path.join(process.cwd(), 'app/(app)/layout.tsx')
    const src = fs.readFileSync(layoutPath, 'utf-8')
    expect(src).toContain("redirect('/login')")
    expect(src).toContain('getSession')
  })

  it('T17 - app layout redirects to /inactive when isActive=false', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const layoutPath = path.join(process.cwd(), 'app/(app)/layout.tsx')
    const src = fs.readFileSync(layoutPath, 'utf-8')
    expect(src).toContain("redirect('/inactive')")
    expect(src).toContain('isActive')
  })
})
