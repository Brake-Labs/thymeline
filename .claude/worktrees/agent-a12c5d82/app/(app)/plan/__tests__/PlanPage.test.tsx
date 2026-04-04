// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockReplace = vi.fn()
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => ({ get: () => null }),
}))

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'test-token',
}))

vi.mock('@/components/plan/SetupStep', () => ({
  default: () => React.createElement('div', { 'data-testid': 'setup-step' }, 'SetupStep'),
}))
vi.mock('@/components/plan/SuggestionsStep', () => ({
  default: () => React.createElement('div', { 'data-testid': 'suggestions-step' }, 'SuggestionsStep'),
}))
vi.mock('@/components/plan/SummaryStep', () => ({
  default: () => React.createElement('div', { 'data-testid': 'summary-step' }, 'SummaryStep'),
}))
vi.mock('@/components/plan/PostSaveModal', () => ({
  default: () => null,
}))

// ── T38: /plan always shows the wizard without redirecting ────────────────────

describe('T38 - /plan always renders the wizard directly', () => {
  it('shows the setup step immediately without a loading state or redirect', async () => {
    const { default: PlanPage } = await import('../page')
    render(React.createElement(PlanPage))

    // Setup step must be immediately visible
    expect(screen.getByTestId('setup-step')).toBeInTheDocument()
    // No loading spinner
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument()
    // No redirect — wizard owns this route entirely
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
