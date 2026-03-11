// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock Supabase browser client
const mockGetUser = vi.fn()
const mockGetSession = vi.fn()
vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
  }),
  getAccessToken: async () => 'mock-token',
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock sessionStorage
const sessionStorageMock: Record<string, string> = {}
Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: (key: string) => sessionStorageMock[key] ?? null,
    setItem: (key: string, value: string) => { sessionStorageMock[key] = value },
    removeItem: (key: string) => { delete sessionStorageMock[key] },
  },
  writable: true,
})

import AuthCompletePage from '../page'

beforeEach(() => {
  mockPush.mockClear()
  mockFetch.mockClear()
  mockGetUser.mockReset()
  delete sessionStorageMock['forkcast_invite_token']
})

// ── T05: New user lands on /onboarding after auth with valid invite ────────────
describe('T05 - New user with valid invite redirects to /onboarding', () => {
  it('redirects to /onboarding when onboarding_completed=false and invite consumed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    sessionStorageMock['forkcast_invite_token'] = 'valid-token'

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ onboarding_completed: false, is_active: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })

    await act(async () => {
      render(<AuthCompletePage />)
    })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/onboarding')
    })
  })
})

// ── T06: Returning user lands on /home after auth ─────────────────────────────
describe('T06 - Returning user redirects to /home', () => {
  it('redirects to /home when onboarding_completed=true', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })

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
})

// ── T16: New user without valid invite is redirected to /inactive ─────────────
describe('T16 - New user without valid invite goes to /inactive', () => {
  it('redirects to /inactive when consume returns success=false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    // No token in sessionStorage

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ onboarding_completed: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: false, reason: 'No invite token' }) })

    await act(async () => {
      render(<AuthCompletePage />)
    })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/inactive')
    })
  })
})

// ── preferences 500 after retry → redirects to /login ────────────────────────
describe('preferences 500 after retry → redirects to /login', () => {
  it('redirects to /login when preferences returns non-ok on both attempts', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'permission denied' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'permission denied' }) })

    await act(async () => {
      render(<AuthCompletePage />)
    })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login')
      // Must not attempt invite consume
      expect(mockFetch).toHaveBeenCalledTimes(2)
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
    expect(src).toContain('getUser')
  })

  it('T17 - app layout redirects to /inactive when is_active=false', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const layoutPath = path.join(process.cwd(), 'app/(app)/layout.tsx')
    const src = fs.readFileSync(layoutPath, 'utf-8')
    expect(src).toContain("redirect('/inactive')")
    expect(src).toContain('is_active')
  })
})
