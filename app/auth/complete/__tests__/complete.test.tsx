// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'

// vi.hoisted ensures these are available inside vi.mock factory (hoisted before imports)
const { mockPush, mockGetUser, mockUpdateUser } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockGetUser: vi.fn(),
  mockUpdateUser: vi.fn().mockResolvedValue({}),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
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
  mockUpdateUser.mockClear()
  delete sessionStorageMock['forkcast_invite_token']
})

// ── T05: New user lands on /onboarding after auth with valid invite ────────────
describe('T05 - New user with valid invite redirects to /onboarding', () => {
  it('stamps user_metadata and redirects to /onboarding when invite consumed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    sessionStorageMock['forkcast_invite_token'] = 'valid-token'

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ onboarding_completed: false, is_active: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })

    await act(async () => {
      render(<AuthCompletePage />)
    })

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ data: { is_active: true } })
      expect(mockPush).toHaveBeenCalledWith('/onboarding')
    })
  })
})

// ── T06: Returning user lands on /home after auth ─────────────────────────────
describe('T06 - Returning user redirects to /home', () => {
  it('stamps user_metadata and redirects to /home when onboarding_completed=true', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ onboarding_completed: true, is_active: true }),
    })

    await act(async () => {
      render(<AuthCompletePage />)
    })

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ data: { is_active: true } })
      expect(mockPush).toHaveBeenCalledWith('/home')
    })
  })

  it('redirects to /home even when DB is_active=false (metadata is now the source of truth)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ onboarding_completed: true, is_active: false }),
    })

    await act(async () => {
      render(<AuthCompletePage />)
    })

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ data: { is_active: true } })
      expect(mockPush).toHaveBeenCalledWith('/home')
    })
  })
})

// ── Doubly-corrupted user (onboarding_completed=false, is_active=true after migration) ─
describe('doubly-corrupted user with is_active=true but onboarding_completed=false', () => {
  it('stamps metadata and redirects to /home without calling consume', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    // No invite token — simulates returning user whose onboarding_completed was reset

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ onboarding_completed: false, is_active: true }),
    })

    await act(async () => {
      render(<AuthCompletePage />)
    })

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ data: { is_active: true } })
      expect(mockPush).toHaveBeenCalledWith('/home')
      // consume must NOT be called — it would run setInactive and undo migration 007
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})

// ── T16: New user without valid invite is redirected to /inactive ─────────────
describe('T16 - New user without valid invite goes to /inactive', () => {
  it('does not stamp metadata and redirects to /inactive when consume returns success=false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    // No token in sessionStorage

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ onboarding_completed: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: false, reason: 'No invite token' }) })

    await act(async () => {
      render(<AuthCompletePage />)
    })

    await waitFor(() => {
      expect(mockUpdateUser).not.toHaveBeenCalled()
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
      expect(mockUpdateUser).not.toHaveBeenCalled()
      expect(mockPush).toHaveBeenCalledWith('/login')
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
