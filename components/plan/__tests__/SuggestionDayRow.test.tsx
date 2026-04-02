// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SuggestionDayRow, { type MealTypeState } from '../SuggestionDayRow'
import type { RecipeSuggestion, DaySelection, MealType } from '@/types'

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
}))

const DATE = '2026-03-02'
const OTHER_DATE = '2026-03-03'
const RECIPE_A: RecipeSuggestion = { recipe_id: 'r1', recipe_title: 'Pasta', reason: 'Quick weeknight' }
const RECIPE_B: RecipeSuggestion = { recipe_id: 'r2', recipe_title: 'Tacos' }

const DEFAULT_MEAL_TYPES: MealTypeState[] = [
  { meal_type: 'dinner', options: [RECIPE_A, RECIPE_B], isSwapping: false },
]

function makeSelections(overrides: Record<string, DaySelection | null> = {}): Record<string, DaySelection | null> {
  return overrides
}

function makeRow(overrides: Partial<Parameters<typeof SuggestionDayRow>[0]> = {}) {
  return {
    date: DATE,
    mealTypeSuggestions: DEFAULT_MEAL_TYPES,
    selections: makeSelections(),
    activeMealTypes: ['dinner'] as MealType[],
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
    fireEvent.click(screen.getAllByText('Select')[0]!)
    expect(onSelect).toHaveBeenCalledWith(DATE, 'dinner', RECIPE_A)
  })

  it('shows checkmark for selected recipe; unselected option retains Select button', () => {
    const sel: DaySelection = { date: DATE, meal_type: 'dinner', recipe_id: 'r1', recipe_title: 'Pasta', from_vault: false }
    render(<SuggestionDayRow {...makeRow({ selections: { [`${DATE}:dinner`]: sel } })} />)
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
    fireEvent.click(screen.getAllByText('Use for a different day')[0]!)
    expect(screen.getByRole('dialog', { name: 'Use for a different day' })).toBeInTheDocument()
  })
})

// ── T17b: Cross-day assignment passes sourceDate ──────────────────────────────

describe('T17b - Cross-day assignment calls onAssignToDay with sourceDate', () => {
  it('calls onAssignToDay(recipe, sourceDate, targetDate, mealType) when target day is picked', () => {
    const onAssignToDay = vi.fn()
    render(<SuggestionDayRow {...makeRow({ onAssignToDay })} />)
    // Open picker for RECIPE_A (first "Use for a different day")
    fireEvent.click(screen.getAllByText('Use for a different day')[0]!)
    // Pick OTHER_DATE from the dialog (2026-03-03 → "Tuesday, Mar 3")
    fireEvent.click(screen.getByText('Tuesday, Mar 3'))
    expect(onAssignToDay).toHaveBeenCalledWith(RECIPE_A, DATE, OTHER_DATE, 'dinner')
  })
})

// ── T23: Skip this slot ────────────────────────────────────────────────────────

describe('T23 - Skip and undo', () => {
  it('calls onSkip when "Skip this slot" is clicked', () => {
    const onSkip = vi.fn()
    render(<SuggestionDayRow {...makeRow({ onSkip })} />)
    fireEvent.click(screen.getByText('Skip this slot'))
    expect(onSkip).toHaveBeenCalledWith(DATE, 'dinner')
  })

  it('shows "Skipping this slot" and Undo when selection is null', () => {
    render(<SuggestionDayRow {...makeRow({ selections: { [`${DATE}:dinner`]: null } })} />)
    expect(screen.getAllByText(/Skipping this slot/).length).toBeGreaterThan(0)
    expect(screen.getByText('Undo')).toBeInTheDocument()
  })

  it('calls onSkip (undo) when Undo is clicked', () => {
    const onSkip = vi.fn()
    render(<SuggestionDayRow {...makeRow({ selections: { [`${DATE}:dinner`]: null }, onSkip })} />)
    fireEvent.click(screen.getByText('Undo'))
    expect(onSkip).toHaveBeenCalledWith(DATE, 'dinner')
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
    const sel: DaySelection = { date: DATE, meal_type: 'dinner', recipe_id: 'r1', recipe_title: 'Pasta', from_vault: true }
    render(<SuggestionDayRow {...makeRow({ selections: { [`${DATE}:dinner`]: sel } })} />)
    expect(screen.getByText('From vault')).toBeInTheDocument()
  })
})

// ── Vault/free-text selection not in options list (regression: Bug 2) ─────────

describe('Vault selection absent from options — selected-recipe row (regression)', () => {
  const VAULT_SEL: DaySelection = {
    date: DATE,
    meal_type: 'dinner',
    recipe_id: 'r-vault',
    recipe_title: 'My Vault Recipe',
    from_vault: true,
  }
  const key = `${DATE}:dinner`

  it('renders the "From your vault" row with the recipe title when selection is not in options', () => {
    render(<SuggestionDayRow {...makeRow({ selections: { [key]: VAULT_SEL } })} />)
    expect(screen.getByText('My Vault Recipe')).toBeInTheDocument()
    expect(screen.getByText('From your vault')).toBeInTheDocument()
  })

  it('does NOT render the "From your vault" row when the selection IS one of the options', () => {
    // r1 (Pasta) is in options — should use the inline selected style, not the vault row
    const inOptionsSel: DaySelection = { date: DATE, meal_type: 'dinner', recipe_id: 'r1', recipe_title: 'Pasta', from_vault: true }
    render(<SuggestionDayRow {...makeRow({ selections: { [key]: inOptionsSel } })} />)
    expect(screen.queryByText('From your vault')).not.toBeInTheDocument()
  })

  it('clicking the checkmark on the vault row calls onSelect with the matched recipe', () => {
    const onSelect = vi.fn()
    render(<SuggestionDayRow {...makeRow({ selections: { [key]: VAULT_SEL }, onSelect })} />)
    fireEvent.click(screen.getByTitle('Deselect'))
    expect(onSelect).toHaveBeenCalledWith(
      DATE,
      'dinner',
      expect.objectContaining({ recipe_id: 'r-vault', recipe_title: 'My Vault Recipe' }),
    )
  })
})

// ── Regression: duplicate dessert button (Bug #215) ───────────────────────────

describe('Dessert add-on renders exactly once (regression)', () => {
  it('shows exactly one "Add dessert" button when a dinner selection exists', () => {
    const sel: DaySelection = { date: DATE, meal_type: 'dinner', recipe_id: 'r1', recipe_title: 'Pasta', from_vault: false }
    render(<SuggestionDayRow {...makeRow({ selections: { [`${DATE}:dinner`]: sel } })} />)
    expect(screen.getAllByText('Add dessert')).toHaveLength(1)
  })

  it('does not show "Add dessert" when no selection has been made', () => {
    render(<SuggestionDayRow {...makeRow()} />)
    expect(screen.queryByText('Add dessert')).not.toBeInTheDocument()
  })
})

// ── Side dish add-on ──────────────────────────────────────────────────────────

describe('Side dish add-on', () => {
  it('shows "Add side dish" above "Add dessert" when a dinner selection exists', () => {
    const sel: DaySelection = { date: DATE, meal_type: 'dinner', recipe_id: 'r1', recipe_title: 'Pasta', from_vault: false }
    render(<SuggestionDayRow {...makeRow({ selections: { [`${DATE}:dinner`]: sel } })} />)
    expect(screen.getByText('Add side dish')).toBeInTheDocument()
    // Side dish must appear before dessert in the DOM
    const sideDish = screen.getByText('Add side dish')
    const dessert  = screen.getByText('Add dessert')
    expect(sideDish.compareDocumentPosition(dessert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not show "Add side dish" when no selection has been made', () => {
    render(<SuggestionDayRow {...makeRow()} />)
    expect(screen.queryByText('Add side dish')).not.toBeInTheDocument()
  })
})
