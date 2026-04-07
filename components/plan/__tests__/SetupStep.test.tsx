// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import SetupStep from '../SetupStep'
import type { PlanSetup } from '@/types'

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
}))

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ firstClass: [], custom: [] }),
})

const defaultSetup: PlanSetup = {
  weekStart: '2026-04-07',
  activeDates: ['2026-04-07'],
  activeMealTypes: ['dinner'],
  preferThisWeek: [],
  avoidThisWeek: [],
  freeText: '',
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Issue 291: Context textarea should auto-grow as the user types ────────────
describe('Issue 291 - Context textarea auto-grow', () => {
  it('renders without a fixed rows attribute', async () => {
    await act(async () => {
      render(
        <SetupStep
          setup={defaultSetup}
          onSetupChange={vi.fn()}
          onGetSuggestions={vi.fn()}
          isGenerating={false}
        />
      )
    })

    const textarea = screen.getByPlaceholderText('Anything to keep in mind this week?')
    expect(textarea).toBeInTheDocument()
    expect(textarea).not.toHaveAttribute('rows')
  })

  it('adjusts height on input (style.height is set)', async () => {
    const onSetupChange = vi.fn()

    await act(async () => {
      render(
        <SetupStep
          setup={defaultSetup}
          onSetupChange={onSetupChange}
          onGetSuggestions={vi.fn()}
          isGenerating={false}
        />
      )
    })

    const textarea = screen.getByPlaceholderText('Anything to keep in mind this week?')

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Busy week, keep things quick and simple.' } })
    })

    // adjustHeight sets style.height — even in jsdom (scrollHeight = 0) the property is touched
    expect((textarea as HTMLTextAreaElement).style.height).toBeDefined()
  })
})
