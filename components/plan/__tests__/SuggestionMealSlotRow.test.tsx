// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SuggestionMealSlotRow from '../SuggestionMealSlotRow'
import type { RecipeSuggestion, DaySelection, MealType } from '@/types'

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
}))

vi.mock('../AssignDayPicker', () => ({
  default: () => null,
}))

vi.mock('../VaultSearchSheet', () => ({
  default: () => null,
}))

const DATE = '2026-03-01'

function makeSlotRow(options: RecipeSuggestion[], selection?: DaySelection | null) {
  return render(
    <SuggestionMealSlotRow
      date={DATE}
      mealType={'dinner' as MealType}
      options={options}
      selection={selection ?? undefined}
      isSwapping={false}
      activeDates={[DATE]}
      onSelect={vi.fn()}
      onSkip={vi.fn()}
      onSwap={vi.fn()}
      onAssignToDay={vi.fn()}
      onVaultPick={vi.fn()}
      onFreeTextMatch={vi.fn(async () => ({ matched: false }))}
    />,
  )
}

// ── T06: Suggestion with waste_badge_text shows amber badge ───────────────────

describe('T06 - Suggestion with waste_badge_text shows amber badge in UI', () => {
  it('renders waste badge text when waste_badge_text is present', () => {
    const opts: RecipeSuggestion[] = [
      {
        recipe_id: 'r1',
        recipe_title: 'Spinach Pasta',
        waste_badge_text: 'Uses up your spinach',
      },
    ]
    makeSlotRow(opts)
    expect(screen.getByText('Uses up your spinach')).toBeTruthy()
  })

  it('renders "Pairs with next week\'s plan" badge text', () => {
    const opts: RecipeSuggestion[] = [
      {
        recipe_id: 'r1',
        recipe_title: 'Spinach Pasta',
        waste_badge_text: "Pairs with next week's plan",
      },
    ]
    makeSlotRow(opts)
    expect(screen.getByText("Pairs with next week's plan")).toBeTruthy()
  })

  it('renders "Uses up N ingredients" badge text for multiple matches', () => {
    const opts: RecipeSuggestion[] = [
      {
        recipe_id: 'r1',
        recipe_title: 'Spinach Pasta',
        waste_badge_text: 'Uses up 3 ingredients',
      },
    ]
    makeSlotRow(opts)
    expect(screen.getByText('Uses up 3 ingredients')).toBeTruthy()
  })

  it('does not render a waste badge when waste_badge_text is absent', () => {
    const opts: RecipeSuggestion[] = [
      {
        recipe_id: 'r1',
        recipe_title: 'Beef Stew',
      },
    ]
    makeSlotRow(opts)
    expect(screen.queryByText(/uses up/i)).toBeNull()
    expect(screen.queryByText(/pairs with/i)).toBeNull()
  })
})
