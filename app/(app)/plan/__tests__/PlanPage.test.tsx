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


vi.mock('@/components/plan/ContextScreen', () => ({
  default: () => React.createElement('div', { 'data-testid': 'context-screen' }, 'ContextScreen'),
}))
vi.mock('@/components/plan/SuggestionsScreen', () => ({
  default: () => React.createElement('div', { 'data-testid': 'suggestions-screen' }, 'SuggestionsScreen'),
}))

// ── T26: /plan uses 2-screen flow ───────────────────────────────────────────

describe('T26 - /plan renders 2-screen flow', () => {
  it('shows the context screen immediately without a loading state or redirect', async () => {
    const { default: PlanPage } = await import('../page')
    render(React.createElement(PlanPage))

    // Context screen must be immediately visible
    expect(screen.getByTestId('context-screen')).toBeInTheDocument()
    // No loading spinner
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument()
    // No redirect
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
