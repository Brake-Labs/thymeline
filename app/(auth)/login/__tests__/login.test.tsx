// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// Mock auth client
const { mockSignInSocial } = vi.hoisted(() => ({
  mockSignInSocial: vi.fn(),
}))
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { social: mockSignInSocial },
    signOut: vi.fn(),
    useSession: vi.fn().mockReturnValue({ data: { user: { id: 'user-1' } }, isPending: false }),
    getSession: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
  },
}))

import LoginPage from '../page'

beforeEach(() => {
  mockSignInSocial.mockClear()
})

// ── T04: Google OAuth button present ─────────────────────────────────────────
describe('T04 - Google OAuth button', () => {
  it('renders Google OAuth button and calls authClient.signIn.social on click', async () => {
    mockSignInSocial.mockResolvedValue({})

    await act(async () => {
      render(<LoginPage />)
    })

    const googleButton = screen.getByRole('button', { name: /continue with google/i })
    expect(googleButton).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(googleButton)
    })

    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: '/auth/complete',
      })
    })
  })
})

// ── Branding ──────────────────────────────────────────────────────────────────
describe('Login page branding', () => {
  it('renders the Thymeline wordmark and tagline', async () => {
    await act(async () => {
      render(<LoginPage />)
    })
    expect(screen.getAllByText('Thymeline').length).toBeGreaterThan(0)
    expect(screen.getByText(/ai-powered meal planning/i)).toBeInTheDocument()
  })
})
