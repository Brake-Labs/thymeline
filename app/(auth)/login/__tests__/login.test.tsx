// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}))

// Mock Supabase browser client
const mockSignInWithOtp = vi.fn()
const mockSignInWithOAuth = vi.fn()
vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}))

// LoginForm is exported via 'use client' page — import the page and find the form
// We test the functional parts via the Suspense-wrapped content
import LoginPage from '../page'

beforeEach(() => {
  mockSignInWithOtp.mockClear()
  mockSignInWithOAuth.mockClear()
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
})

// ── T02: Magic link email is sent when user submits valid email ───────────────
describe('T02 - Magic link form submission', () => {
  it('calls signInWithOtp with the entered email', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    await act(async () => {
      render(<LoginPage />)
    })

    const emailInput = screen.getByLabelText(/email address/i)
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })

    const submitButton = screen.getByRole('button', { name: /send me a link/i })
    await act(async () => {
      fireEvent.click(submitButton)
    })

    await waitFor(() => {
      expect(mockSignInWithOtp).toHaveBeenCalledWith({
        email: 'test@example.com',
        options: { emailRedirectTo: 'http://localhost:3000/auth/callback' },
      })
    })
  })
})

// ── T03: Confirmation message shown after magic link sent ─────────────────────
describe('T03 - Confirmation message after magic link', () => {
  it('shows confirmation message after successful submission', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })

    await act(async () => {
      render(<LoginPage />)
    })

    const emailInput = screen.getByLabelText(/email address/i)
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send me a link/i }))
    })

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument()
    })

    // Form should be replaced — email input no longer visible
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument()
  })
})

// ── T04: Google OAuth button present ─────────────────────────────────────────
describe('T04 - Google OAuth button', () => {
  it('renders Google OAuth button and calls signInWithOAuth on click', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null })

    await act(async () => {
      render(<LoginPage />)
    })

    const googleButton = screen.getByRole('button', { name: /continue with google/i })
    expect(googleButton).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(googleButton)
    })

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: 'http://localhost:3000/auth/callback' },
      })
    })
  })
})

// ── Branding ──────────────────────────────────────────────────────────────────
describe('Login page branding', () => {
  it('renders the Forkcast wordmark and tagline', async () => {
    await act(async () => {
      render(<LoginPage />)
    })
    expect(screen.getAllByText('Forkcast').length).toBeGreaterThan(0)
    expect(screen.getByText(/ai-powered meal planning/i)).toBeInTheDocument()
  })
})
