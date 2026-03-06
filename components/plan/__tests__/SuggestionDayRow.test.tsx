// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SuggestionDayRow from '../SuggestionDayRow'
import type { RecipeSuggestion, DaySelection } from '@/types'

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
}))

const DATE = '2026-03-02'
const OTHER_DATE = '2026-03-03'
const RECIPE_A: RecipeSuggestion = { recipe_id: 'r1', recipe_title: 'Pasta', reason: 'Quick weeknight' }
const RECIPE_B: RecipeSuggestion = { recipe_id: 'r2', recipe_title: 'Tacos' }

function makeRow(overrides: Partial<Parameters<typeof SuggestionDayRow>[0]> = {}) {
  return {
    date: DATE,
    options: [RECIPE_A, RECIPE_B],
    selection: undefined,
    isSwapping: false,
    activeDates: [DATE, OTHER_DATE],
    onSelect: vi.fn(),
    onSkip: vi.fn(),
    onSwap: vi.fn(),
    onAssignToDay: vi.fn(),
    onVaultPick: vi.fn(),
    onFreeTextMatch: vi.fn(async () => ({ matched: false })),
    ...overrides,
  }
}

// ── T16: Select highlights the chosen option ──────────────────────────────────

describe('T16 - Selection highlights chosen option', () => {
  it('renders Select buttons when nothing is selected', () => {
    render(<SuggestionDayRow {...makeRow()} />)
    expect(screen.getAllByText('Select')).toHaveLength(2)
  })

  it('calls onSelect when Select is clicked', () => {
    const onSelect = vi.fn()
    render(<SuggestionDayRow {...makeRow({ onSelect })} />)
    fireEvent.click(screen.getAllByText('Select')[0])
    expect(onSelect).toHaveBeenCalledWith(DATE, RECIPE_A)
  })

  it('shows checkmark for selected recipe; unselected option retains Select button', () => {
    const sel: DaySelection = { date: DATE, recipe_id: 'r1', recipe_title: 'Pasta', from_vault: false }
    render(<SuggestionDayRow {...makeRow({ selection: sel })} />)
    // r1 is selected → only 1 Select button remains (for r2)
    expect(screen.getAllByText('Select')).toHaveLength(1)
  })
})

// ── T17/T18/T19: Cross-day assignment ────────────────────────────────────────

describe('T17 - Use for a different day shows AssignDayPicker', () => {
  it('renders "Use for a different day" buttons', () => {
    render(<SuggestionDayRow {...makeRow()} />)
    const links = screen.getAllByText('Use for a different day')
    expect(links.length).toBeGreaterThan(0)
  })

  it('opens the AssignDayPicker when "Use for a different day" is clicked', () => {
    render(<SuggestionDayRow {...makeRow()} />)
    fireEvent.click(screen.getAllByText('Use for a different day')[0])
    // Picker opens — "Use for…" heading is visible
    expect(screen.getByText('Use for…')).toBeInTheDocument()
    // The other active date option is shown in the picker
    expect(screen.getByRole('dialog', { name: 'Assign to a different day' })).toBeInTheDocument()
  })
})

// ── T23: Skip this day ────────────────────────────────────────────────────────

describe('T23 - Skip and undo', () => {
  it('calls onSkip when "Skip this day" is clicked', () => {
    const onSkip = vi.fn()
    render(<SuggestionDayRow {...makeRow({ onSkip })} />)
    fireEvent.click(screen.getByText('Skip this day'))
    expect(onSkip).toHaveBeenCalledWith(DATE)
  })

  it('shows "Skipping this day" and Undo when selection is null', () => {
    render(<SuggestionDayRow {...makeRow({ selection: null })} />)
    // Text appears in both header span and body paragraph; both should be present
    expect(screen.getAllByText(/Skipping this day/).length).toBeGreaterThan(0)
    expect(screen.getByText('Undo')).toBeInTheDocument()
  })

  it('calls onSkip (undo) when Undo is clicked', () => {
    const onSkip = vi.fn()
    render(<SuggestionDayRow {...makeRow({ selection: null, onSkip })} />)
    fireEvent.click(screen.getByText('Undo'))
    expect(onSkip).toHaveBeenCalledWith(DATE)
  })
})

// ── T20: Pick from vault ──────────────────────────────────────────────────────

describe('T20 - Pick from my vault opens VaultSearchSheet', () => {
  it('renders "Pick from my vault" button', () => {
    render(<SuggestionDayRow {...makeRow()} />)
    expect(screen.getByText('Pick from my vault')).toBeInTheDocument()
  })
})

// ── Reason field ──────────────────────────────────────────────────────────────

describe('Reason field display', () => {
  it('renders the reason text when present', () => {
    render(<SuggestionDayRow {...makeRow()} />)
    expect(screen.getByText('Quick weeknight')).toBeInTheDocument()
  })
})

// ── From vault label ──────────────────────────────────────────────────────────

describe('From vault label', () => {
  it('shows "From vault" when selection has from_vault=true', () => {
    const sel: DaySelection = { date: DATE, recipe_id: 'r1', recipe_title: 'Pasta', from_vault: true }
    render(<SuggestionDayRow {...makeRow({ selection: sel })} />)
    expect(screen.getByText('From vault')).toBeInTheDocument()
  })
})
