// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SuggestionsStep from '../SuggestionsStep'
import type { RecipeSuggestion, DaySelection, MealType } from '@/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))


const WEEK_START = '2026-03-01'
const DATE_1 = '2026-03-01'
const DATE_2 = '2026-03-02'

const RECIPE_A: RecipeSuggestion = { recipe_id: 'r1', recipe_title: 'Pasta', reason: 'Quick' }
const RECIPE_B: RecipeSuggestion = { recipe_id: 'r2', recipe_title: 'Tacos' }

function makeSetup(activeDates = [DATE_1, DATE_2]) {
  return {
    weekStart:       WEEK_START,
    activeDates,
    activeMealTypes: ['dinner'] as MealType[],
    preferThisWeek:  [],
    avoidThisWeek:   [],
    freeText:        '',
  }
}

function makeSuggestions(days = [DATE_1]) {
  return {
    days: days.map((date) => ({
      date,
      meal_types: [{
        meal_type: 'dinner' as MealType,
        options: date === DATE_1 ? [RECIPE_A, RECIPE_B] : [RECIPE_B],
        isSwapping: false,
      }],
    })),
  }
}

function makeDefaultProps(overrides = {}) {
  return {
    setup: makeSetup([DATE_1]),
    suggestions: makeSuggestions([DATE_1]),
    selections: {},
    onSelect: vi.fn(),
    onSkipSlot: vi.fn(),
    onSwapSlot: vi.fn(),
    onAssignToDay: vi.fn(),
    onVaultPick: vi.fn(),
    onFreeTextMatch: vi.fn(async () => ({ matched: false })),
    onRegenerate: vi.fn(),
    onConfirm: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
}

// ── T14: Skeleton loading while swapping ──────────────────────────────────────

describe('T14 - Skeleton shown while a slot is swapping', () => {
  it('renders skeleton for the swapping slot', () => {
    const suggestions = {
      days: [
        {
          date: DATE_1,
          meal_types: [{ meal_type: 'dinner' as MealType, options: [RECIPE_A], isSwapping: true }],
        },
      ],
    }
    render(<SuggestionsStep {...makeDefaultProps({ suggestions })} />)
    expect(screen.queryByRole('button', { name: /select/i })).not.toBeInTheDocument()
    expect(screen.getByText('Swap')).toBeInTheDocument()
  })
})

// ── T15: Regenerate with no selections triggers immediately ───────────────────

describe('T15 - Regenerate with no selections regenerates immediately', () => {
  it('calls onRegenerate without showing prompt when no selections', () => {
    const onRegenerate = vi.fn()
    render(<SuggestionsStep {...makeDefaultProps({ onRegenerate })} />)
    fireEvent.click(screen.getByText('Regenerate'))
    expect(onRegenerate).toHaveBeenCalled()
    expect(screen.queryByText('Regenerate all days')).not.toBeInTheDocument()
  })
})

// ── T15b: Regenerate prompt shown when selections exist ───────────────────────

describe('T15b - Regenerate prompt shown when selections exist', () => {
  it('shows two options when user has existing selections', () => {
    const sel: Record<string, DaySelection | null> = {
      [`${DATE_1}:dinner`]: { date: DATE_1, meal_type: 'dinner', recipe_id: 'r1', recipe_title: 'Pasta', from_vault: false },
    }
    render(
      <SuggestionsStep
        {...makeDefaultProps({ setup: makeSetup([DATE_1, DATE_2]), suggestions: makeSuggestions([DATE_1, DATE_2]), selections: sel })}
      />
    )
    fireEvent.click(screen.getByText('Regenerate'))
    expect(screen.getByText('Regenerate all days')).toBeInTheDocument()
    expect(screen.getByText('Regenerate unselected slots only')).toBeInTheDocument()
  })
})

// ── T15c: Regenerate all days ─────────────────────────────────────────────────

describe('T15c - Regenerate all days clears selections', () => {
  it('calls onRegenerate(false) for all days', () => {
    const onRegenerate = vi.fn()
    const sel: Record<string, DaySelection | null> = {
      [`${DATE_1}:dinner`]: { date: DATE_1, meal_type: 'dinner', recipe_id: 'r1', recipe_title: 'Pasta', from_vault: false },
    }
    render(
      <SuggestionsStep
        {...makeDefaultProps({ setup: makeSetup([DATE_1, DATE_2]), suggestions: makeSuggestions([DATE_1, DATE_2]), selections: sel, onRegenerate })}
      />
    )
    fireEvent.click(screen.getByText('Regenerate'))
    fireEvent.click(screen.getByText('Regenerate all days'))
    expect(onRegenerate).toHaveBeenCalledWith(false)
  })
})

// ── T15d: Regenerate unselected slots only ────────────────────────────────────

describe('T15d - Regenerate unselected slots only', () => {
  it('calls onRegenerate(true) for unselected slots only', () => {
    const onRegenerate = vi.fn()
    const sel: Record<string, DaySelection | null> = {
      [`${DATE_1}:dinner`]: { date: DATE_1, meal_type: 'dinner', recipe_id: 'r1', recipe_title: 'Pasta', from_vault: false },
    }
    render(
      <SuggestionsStep
        {...makeDefaultProps({ setup: makeSetup([DATE_1, DATE_2]), suggestions: makeSuggestions([DATE_1, DATE_2]), selections: sel, onRegenerate })}
      />
    )
    fireEvent.click(screen.getByText('Regenerate'))
    fireEvent.click(screen.getByText('Regenerate unselected slots only'))
    expect(onRegenerate).toHaveBeenCalledWith(true)
  })
})

// ── T24: Confirm Plan disabled with 0 selections ──────────────────────────────

describe('T24 - Confirm Plan button state', () => {
  it('is disabled when no selections', () => {
    render(<SuggestionsStep {...makeDefaultProps()} />)
    expect(screen.getByText('Confirm Plan')).toBeDisabled()
  })

  it('is enabled when at least 1 selection exists', () => {
    const sel: Record<string, DaySelection | null> = {
      [`${DATE_1}:dinner`]: { date: DATE_1, meal_type: 'dinner', recipe_id: 'r1', recipe_title: 'Pasta', from_vault: false },
    }
    render(<SuggestionsStep {...makeDefaultProps({ selections: sel })} />)
    expect(screen.getByText('Confirm Plan')).not.toBeDisabled()
  })
})

// ── T32: Confirm Plan disabled when all slots are skipped (null) ──────────────

describe('T32 - Confirm Plan disabled with zero non-null entries in SelectionsMap', () => {
  it('is disabled when every slot is skipped (all values are null)', () => {
    const sel: Record<string, DaySelection | null> = {
      [`${DATE_1}:dinner`]: null,
      [`${DATE_2}:dinner`]: null,
    }
    render(
      <SuggestionsStep
        {...makeDefaultProps({
          setup: makeSetup([DATE_1, DATE_2]),
          suggestions: makeSuggestions([DATE_1, DATE_2]),
          selections: sel,
        })}
      />
    )
    expect(screen.getByText('Confirm Plan')).toBeDisabled()
  })
})
