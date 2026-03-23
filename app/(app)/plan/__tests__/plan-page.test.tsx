// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PlanPage from '../page'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
  getSupabaseClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

// Prevent network calls from SetupStep's tag-loading effect
global.fetch = vi.fn(() =>
  Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
) as unknown as typeof fetch

// ── T38: activeMealTypes defaults to ['dinner'] when wizard opens ──────────────

describe('T38 - activeMealTypes initialises to [\'dinner\'] on wizard mount', () => {
  it('renders the Dinner meal-type pill as aria-pressed=true on the setup screen', () => {
    render(<PlanPage />)

    const dinnerPill = screen.getByRole('button', { name: 'Dinner' })
    expect(dinnerPill).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders Breakfast, Lunch, Snacks pills as aria-pressed=false on mount', () => {
    render(<PlanPage />)

    for (const label of ['Breakfast', 'Lunch', 'Snacks']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
  })
})
