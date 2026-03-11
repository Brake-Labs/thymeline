// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SuggestionsStep from '../SuggestionsStep'
import type { RecipeSuggestion, DaySelection } from '@/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
}))

const WEEK_START = '2026-03-01'
const DATE_1 = '2026-03-01'
const DATE_2 = '2026-03-02'

const RECIPE_A: RecipeSuggestion = { recipe_id: 'r1', recipe_title: 'Pasta', reason: 'Quick' }
const RECIPE_B: RecipeSuggestion = { recipe_id: 'r2', recipe_title: 'Tacos' }

function makeSetup(activeDates = [DATE_1, DATE_2]) {
  return {
    weekStart: WEEK_START,
    activeDates,
    preferThisWeek: [],
    avoidThisWeek: [],
    freeText: '',
    specificRequests: '',
  }
}

function makeSuggestions(days = [DATE_1]) {
  return {
    days: days.map((date) => ({
      date,
      options: date === DATE_1 ? [RECIPE_A, RECIPE_B] : [RECIPE_B],
      isSwapping: false,
    })),
  }
}

// ── T07: Get Suggestions disabled with no active dates ────────────────────────
// (Tested in SetupStep — confirmed CTA is gated there)

// ── T14: Skeleton loading while swapping ──────────────────────────────────────

describe('T14 - Skeleton shown while a day is swapping', () => {
  it('renders skeleton for the swapping day row', () => {
    const suggestions = {
      days: [
        { date: DATE_1, options: [RECIPE_A], isSwapping: true },
      ],
    }
    render(
      <SuggestionsStep
        setup={makeSetup([DATE_1])}
        suggestions={suggestions}
        selections={{}}
        onSelect={vi.fn()}
        onSkipDay={vi.fn()}
        onSwapDay={vi.fn()}
        onAssignToDay={vi.fn()}
        onVaultPick={vi.fn()}
        onFreeTextMatch={async () => ({ matched: false })}
        onRegenerate={vi.fn()}
        onConfirm={vi.fn()}
      />
    )
    // No "Select" buttons visible while swapping
    expect(screen.queryByRole('button', { name: /select/i })).not.toBeInTheDocument()
    // "Swap" / "Skip" in header still visible
    expect(screen.getByText('Swap')).toBeInTheDocument()
  })
})

// ── T15: Regenerate with no selections triggers immediately ───────────────────

describe('T15 - Regenerate with no selections regenerates immediately', () => {
  it('calls onRegenerate without showing prompt when no selections', () => {
    const onRegenerate = vi.fn()
    render(
      <SuggestionsStep
        setup={makeSetup([DATE_1])}
        suggestions={makeSuggestions([DATE_1])}
        selections={{}}
        onSelect={vi.fn()}
        onSkipDay={vi.fn()}
        onSwapDay={vi.fn()}
        onAssignToDay={vi.fn()}
        onVaultPick={vi.fn()}
        onFreeTextMatch={async () => ({ matched: false })}
        onRegenerate={onRegenerate}
        onConfirm={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Regenerate'))
    expect(onRegenerate).toHaveBeenCalled()
    // No prompt dropdown
    expect(screen.queryByText('Regenerate all days')).not.toBeInTheDocument()
  })
})

// ── T15b: Regenerate prompt shown when selections exist ───────────────────────

describe('T15b - Regenerate prompt shown when selections exist', () => {
  it('shows two options when user has existing selections', () => {
    const sel: Record<string, DaySelection | null> = {
      [DATE_1]: { date: DATE_1, recipe_id: 'r1', recipe_title: 'Pasta', from_vault: false },
    }
    render(
      <SuggestionsStep
        setup={makeSetup([DATE_1, DATE_2])}
        suggestions={makeSuggestions([DATE_1, DATE_2])}
        selections={sel}
        onSelect={vi.fn()}
        onSkipDay={vi.fn()}
        onSwapDay={vi.fn()}
        onAssignToDay={vi.fn()}
        onVaultPick={vi.fn()}
        onFreeTextMatch={async () => ({ matched: false })}
        onRegenerate={vi.fn()}
        onConfirm={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Regenerate'))
    expect(screen.getByText('Regenerate all days')).toBeInTheDocument()
    expect(screen.getByText('Regenerate unselected days only')).toBeInTheDocument()
  })
})

// ── T15c: Regenerate all days ─────────────────────────────────────────────────

describe('T15c - Regenerate all days clears selections', () => {
  it('calls onRegenerate(false) for all days', () => {
    const onRegenerate = vi.fn()
    const sel: Record<string, DaySelection | null> = {
      [DATE_1]: { date: DATE_1, recipe_id: 'r1', recipe_title: 'Pasta', from_vault: false },
    }
    render(
      <SuggestionsStep
        setup={makeSetup([DATE_1, DATE_2])}
        suggestions={makeSuggestions([DATE_1, DATE_2])}
        selections={sel}
        onSelect={vi.fn()}
        onSkipDay={vi.fn()}
        onSwapDay={vi.fn()}
        onAssignToDay={vi.fn()}
        onVaultPick={vi.fn()}
        onFreeTextMatch={async () => ({ matched: false })}
        onRegenerate={onRegenerate}
        onConfirm={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Regenerate'))
    fireEvent.click(screen.getByText('Regenerate all days'))
    expect(onRegenerate).toHaveBeenCalledWith(false)
  })
})

// ── T15d: Regenerate unselected days only ─────────────────────────────────────

describe('T15d - Regenerate unselected days only', () => {
  it('calls onRegenerate(true) for unselected days only', () => {
    const onRegenerate = vi.fn()
    const sel: Record<string, DaySelection | null> = {
      [DATE_1]: { date: DATE_1, recipe_id: 'r1', recipe_title: 'Pasta', from_vault: false },
    }
    render(
      <SuggestionsStep
        setup={makeSetup([DATE_1, DATE_2])}
        suggestions={makeSuggestions([DATE_1, DATE_2])}
        selections={sel}
        onSelect={vi.fn()}
        onSkipDay={vi.fn()}
        onSwapDay={vi.fn()}
        onAssignToDay={vi.fn()}
        onVaultPick={vi.fn()}
        onFreeTextMatch={async () => ({ matched: false })}
        onRegenerate={onRegenerate}
        onConfirm={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Regenerate'))
    fireEvent.click(screen.getByText('Regenerate unselected days only'))
    expect(onRegenerate).toHaveBeenCalledWith(true)
  })
})

// ── T24: Confirm Plan disabled with 0 selections ──────────────────────────────

describe('T24 - Confirm Plan button state', () => {
  it('is disabled when no selections', () => {
    render(
      <SuggestionsStep
        setup={makeSetup([DATE_1])}
        suggestions={makeSuggestions([DATE_1])}
        selections={{}}
        onSelect={vi.fn()}
        onSkipDay={vi.fn()}
        onSwapDay={vi.fn()}
        onAssignToDay={vi.fn()}
        onVaultPick={vi.fn()}
        onFreeTextMatch={async () => ({ matched: false })}
        onRegenerate={vi.fn()}
        onConfirm={vi.fn()}
      />
    )
    expect(screen.getByText('Confirm Plan')).toBeDisabled()
  })

  it('is enabled when at least 1 selection exists', () => {
    const sel: Record<string, DaySelection | null> = {
      [DATE_1]: { date: DATE_1, recipe_id: 'r1', recipe_title: 'Pasta', from_vault: false },
    }
    render(
      <SuggestionsStep
        setup={makeSetup([DATE_1])}
        suggestions={makeSuggestions([DATE_1])}
        selections={sel}
        onSelect={vi.fn()}
        onSkipDay={vi.fn()}
        onSwapDay={vi.fn()}
        onAssignToDay={vi.fn()}
        onVaultPick={vi.fn()}
        onFreeTextMatch={async () => ({ matched: false })}
        onRegenerate={vi.fn()}
        onConfirm={vi.fn()}
      />
    )
    expect(screen.getByText('Confirm Plan')).not.toBeDisabled()
  })
})
