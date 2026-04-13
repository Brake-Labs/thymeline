// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SuggestionsScreen from '../SuggestionsScreen'
import type { MealType, PlanSetup, SelectionsMap } from '@/types'

// Mock child components
vi.mock('../DayCard', () => ({
  default: ({ date }: { date: string }) => <div data-testid={`day-${date}`}>DayCard</div>,
}))
vi.mock('../GroceryPreview', () => ({
  default: ({ confirmedCount }: { confirmedCount: number }) => (
    <div data-testid="grocery-preview">{confirmedCount} confirmed</div>
  ),
}))
vi.mock('@/lib/date-utils', () => ({
  formatWeekRange: (ws: string) => `Week of ${ws}`,
}))

function makeSetup(overrides: Partial<PlanSetup> = {}): PlanSetup {
  return {
    weekStart: '2026-04-13',
    activeDates: ['2026-04-13', '2026-04-14'],
    activeMealTypes: ['dinner'] as MealType[],
    freeText: '',
    preferThisWeek: [],
    avoidThisWeek: [],
    ...overrides,
  }
}

const baseSuggestions = {
  days: [
    {
      date: '2026-04-13',
      mealTypes: [{ mealType: 'dinner' as MealType, options: [], isSwapping: false }],
      whyThisDay: 'Test reason',
    },
  ],
}

const baseProps = {
  setup: makeSetup(),
  suggestions: baseSuggestions,
  selections: {} as SelectionsMap,
  onSelect: vi.fn(),
  onSkipSlot: vi.fn(),
  onSwapSlot: vi.fn(),
  onAssignToDay: vi.fn(),
  onVaultPick: vi.fn(),
  onFreeTextMatch: vi.fn(),
  onRegenerate: vi.fn(),
  onSaveAndGrocery: vi.fn().mockResolvedValue(undefined),
  onSaveOnly: vi.fn().mockResolvedValue(undefined),
  isSaving: false,
  onBack: vi.fn(),
}

describe('SuggestionsScreen - save button states', () => {
  it('disables save buttons when no selections exist', () => {
    render(<SuggestionsScreen {...baseProps} />)

    expect(screen.getByText('Save Plan Only')).toBeDisabled()
    expect(screen.getByText('Save & Build Grocery List')).toBeDisabled()
  })

  it('enables save buttons when selections exist', () => {
    const selections: SelectionsMap = { '2026-04-13:dinner': { recipeId: 'r1', recipeTitle: 'Test', date: '2026-04-13', mealType: 'dinner' as MealType, fromVault: false } }
    render(<SuggestionsScreen {...baseProps} selections={selections} />)

    expect(screen.getByText('Save Plan Only')).not.toBeDisabled()
    expect(screen.getByText('Save & Build Grocery List')).not.toBeDisabled()
  })

  it('disables save buttons while isSaving', () => {
    const selections: SelectionsMap = { '2026-04-13:dinner': { recipeId: 'r1', recipeTitle: 'Test', date: '2026-04-13', mealType: 'dinner' as MealType, fromVault: false } }
    render(<SuggestionsScreen {...baseProps} selections={selections} isSaving={true} />)

    expect(screen.getByText('Saving\u2026')).toBeInTheDocument()
    expect(screen.getByText('Save Plan Only')).toBeDisabled()
  })
})

describe('SuggestionsScreen - save error handling', () => {
  it('shows error message when onSaveAndGrocery fails', async () => {
    const onSaveAndGrocery = vi.fn().mockRejectedValue(new Error('Network error'))
    const selections: SelectionsMap = { '2026-04-13:dinner': { recipeId: 'r1', recipeTitle: 'Test', date: '2026-04-13', mealType: 'dinner' as MealType, fromVault: false } }

    render(
      <SuggestionsScreen
        {...baseProps}
        selections={selections}
        onSaveAndGrocery={onSaveAndGrocery}
      />
    )

    fireEvent.click(screen.getByText('Save & Build Grocery List'))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('shows error message when onSaveOnly fails', async () => {
    const onSaveOnly = vi.fn().mockRejectedValue(new Error('Save failed'))
    const selections: SelectionsMap = { '2026-04-13:dinner': { recipeId: 'r1', recipeTitle: 'Test', date: '2026-04-13', mealType: 'dinner' as MealType, fromVault: false } }

    render(
      <SuggestionsScreen
        {...baseProps}
        selections={selections}
        onSaveOnly={onSaveOnly}
      />
    )

    fireEvent.click(screen.getByText('Save Plan Only'))

    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeInTheDocument()
    })
  })
})

describe('SuggestionsScreen - regenerate prompt', () => {
  it('calls onRegenerate directly when no selections', () => {
    const onRegenerate = vi.fn()
    render(<SuggestionsScreen {...baseProps} onRegenerate={onRegenerate} />)

    fireEvent.click(screen.getByText('Regenerate'))

    expect(onRegenerate).toHaveBeenCalledOnce()
  })

  it('shows prompt with two options when selections exist', () => {
    const selections: SelectionsMap = { '2026-04-13:dinner': { recipeId: 'r1', recipeTitle: 'Test', date: '2026-04-13', mealType: 'dinner' as MealType, fromVault: false } }
    render(<SuggestionsScreen {...baseProps} selections={selections} />)

    fireEvent.click(screen.getByText('Regenerate'))

    expect(screen.getByText('Regenerate all days')).toBeInTheDocument()
    expect(screen.getByText('Regenerate unselected slots only')).toBeInTheDocument()
  })

  it('calls onRegenerate(false) for "Regenerate all days"', () => {
    const onRegenerate = vi.fn()
    const selections: SelectionsMap = { '2026-04-13:dinner': { recipeId: 'r1', recipeTitle: 'Test', date: '2026-04-13', mealType: 'dinner' as MealType, fromVault: false } }
    render(<SuggestionsScreen {...baseProps} selections={selections} onRegenerate={onRegenerate} />)

    fireEvent.click(screen.getByText('Regenerate'))
    fireEvent.click(screen.getByText('Regenerate all days'))

    expect(onRegenerate).toHaveBeenCalledWith(false)
  })

  it('calls onRegenerate(true) for "Regenerate unselected slots only"', () => {
    const onRegenerate = vi.fn()
    const selections: SelectionsMap = { '2026-04-13:dinner': { recipeId: 'r1', recipeTitle: 'Test', date: '2026-04-13', mealType: 'dinner' as MealType, fromVault: false } }
    render(<SuggestionsScreen {...baseProps} selections={selections} onRegenerate={onRegenerate} />)

    fireEvent.click(screen.getByText('Regenerate'))
    fireEvent.click(screen.getByText('Regenerate unselected slots only'))

    expect(onRegenerate).toHaveBeenCalledWith(true)
  })
})

describe('SuggestionsScreen - grocery preview', () => {
  it('passes confirmed count to GroceryPreview', () => {
    const selections: SelectionsMap = {
      '2026-04-13:dinner': { recipeId: 'r1', recipeTitle: 'Test', date: '2026-04-13', mealType: 'dinner' as MealType, fromVault: false },
      '2026-04-14:dinner': { recipeId: 'r2', recipeTitle: 'Test 2', date: '2026-04-14', mealType: 'dinner' as MealType, fromVault: false },
    }
    render(<SuggestionsScreen {...baseProps} selections={selections} />)

    expect(screen.getByText('2 confirmed')).toBeInTheDocument()
  })
})
