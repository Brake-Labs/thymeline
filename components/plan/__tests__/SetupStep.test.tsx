// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import SetupStep from '../SetupStep'
import type { PlanSetup } from '@/types'

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: vi.fn(async () => 'mock-token'),
}))

const SETUP: PlanSetup = {
  weekStart:       '2026-04-06',
  activeDates:     ['2026-04-07'],
  activeMealTypes: ['dinner'],
  preferThisWeek:  [],
  avoidThisWeek:   [],
  freeText:        '',
}

beforeEach(() => {
  vi.restoreAllMocks()
})

// ── Issue 291: Context textarea should auto-grow as the user types ─────────────
describe('SetupStep - context textarea auto-grow (#291)', () => {
  it('renders without a fixed rows attribute', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ firstClass: [], custom: [] }) })) as unknown as typeof fetch

    await act(async () => {
      render(
        <SetupStep
          setup={SETUP}
          onSetupChange={vi.fn()}
          onGetSuggestions={vi.fn()}
          isGenerating={false}
        />
      )
    })

    const textarea = screen.getByPlaceholderText('Anything to keep in mind this week?')
    expect(textarea).not.toHaveAttribute('rows')
  })

  it('sets style.height on change (auto-grow trigger)', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ firstClass: [], custom: [] }) })) as unknown as typeof fetch

    await act(async () => {
      render(
        <SetupStep
          setup={SETUP}
          onSetupChange={vi.fn()}
          onGetSuggestions={vi.fn()}
          isGenerating={false}
        />
      )
    })

    const textarea = screen.getByPlaceholderText('Anything to keep in mind this week?')

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Busy week, keep things simple and quick.' } })
    })

    expect((textarea as HTMLTextAreaElement).style.height).toBeDefined()
  })
})

// ── T-TAGS-EXPAND: Tags expansion renders strings, not objects (regression #244) ─

describe('SetupStep - tags expansion (regression #244)', () => {
  it('renders tag name strings (not [object Object]) when tags section is expanded', async () => {
    // /api/tags returns { firstClass: [{ name, recipe_count }], custom: [] }
    // The bug: firstClass objects were spread directly into allTags, causing React to
    // throw "Objects are not valid as a React child" when TagBucketPicker rendered them.
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        firstClass: [{ name: 'Quick', recipe_count: 3 }, { name: 'Healthy', recipe_count: 1 }],
        custom: [{ name: 'Garden', section: 'custom' }],
      }),
    })) as unknown as typeof fetch

    render(
      <SetupStep
        setup={SETUP}
        onSetupChange={vi.fn()}
        onGetSuggestions={vi.fn()}
        isGenerating={false}
      />
    )

    // Wait for the tags API call to resolve
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tags'),
      expect.any(Object),
    ))

    // Expand the prefer/avoid section
    fireEvent.click(screen.getByRole('button', { name: /prefer \/ avoid/i }))

    // Tag names should render as text, not as "[object Object]"
    // Two TagBucketPicker instances (prefer + avoid) each show the same tags
    await waitFor(() => {
      expect(screen.getAllByText('Quick').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Garden').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
  })

  it('shows "No tags available" when the tags API returns nothing', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })) as unknown as typeof fetch

    render(
      <SetupStep
        setup={SETUP}
        onSetupChange={vi.fn()}
        onGetSuggestions={vi.fn()}
        isGenerating={false}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /prefer \/ avoid/i }))

    expect(screen.getAllByText('No tags available')).toHaveLength(2) // one per bucket
  })
})
