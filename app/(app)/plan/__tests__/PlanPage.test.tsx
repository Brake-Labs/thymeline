// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

// Stub heavy child components to keep test fast
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

// ── T38: /plan redirects to /plan/[week_start] when saved plan exists ─────────

describe('T38 - /plan redirects to read-only view when a saved plan exists', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockPush.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls router.replace with /plan/[week_start] when plan exists', async () => {
    // Mock fetch to return a saved plan
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plan: { id: 'plan-1', week_start: '2026-03-16' } }),
    } as Response)

    // Fix Date so getMostRecentSunday returns a predictable value
    // 2026-03-19 is a Thursday; most recent Sunday is 2026-03-15
    vi.setSystemTime(new Date('2026-03-19T12:00:00Z'))

    const { default: PlanPage } = await import('../page')
    render(React.createElement(PlanPage))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/plan/2026-03-15')
    })
  })

  it('shows the wizard when no saved plan exists for the current week', async () => {
    // Mock fetch to return no plan
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plan: null }),
    } as Response)

    vi.setSystemTime(new Date('2026-03-19T12:00:00Z'))

    const { default: PlanPage } = await import('../page')
    render(React.createElement(PlanPage))

    await waitFor(() => {
      expect(screen.getByTestId('setup-step')).toBeInTheDocument()
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
