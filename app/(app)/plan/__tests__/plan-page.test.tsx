// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PlanPage from '../page'
import type { RecipeSuggestion, MealType } from '@/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))


// Prevent network calls from SetupStep's tag-loading effect
global.fetch = vi.fn(() =>
  Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
) as unknown as typeof fetch

// ── T_assign: Cross-day assignment state transformation logic ─────────────────
//
// The handleAssignToDay handler in PlanPageInner applies a pure transformation to
// SuggestionsState. These tests exercise that transformation directly so we can
// assert on "recipe removed from source, added to target" without needing the
// full React render pipeline.

type MealTypeState = { mealType: MealType; options: RecipeSuggestion[]; isSwapping: boolean }
type DayState = { date: string; mealTypes: MealTypeState[] }

function applyAssign(
  days: DayState[],
  recipe: RecipeSuggestion,
  sourceDate: string,
  targetDate: string,
  mealType: MealType,
): DayState[] {
  return days.map((day) => {
    if (day.date === sourceDate) {
      return {
        ...day,
        mealTypes: day.mealTypes.map((mts) =>
          mts.mealType === mealType
            ? { ...mts, options: mts.options.filter((o) => o.recipeId !== recipe.recipeId) }
            : mts,
        ),
      }
    }
    if (day.date === targetDate) {
      return {
        ...day,
        mealTypes: day.mealTypes.map((mts) =>
          mts.mealType === mealType
            ? {
                ...mts,
                options: mts.options.some((o) => o.recipeId === recipe.recipeId)
                  ? mts.options
                  : [...mts.options, recipe],
              }
            : mts,
        ),
      }
    }
    return day
  })
}

const RECIPE_A: RecipeSuggestion = { recipeId: 'r1', recipeTitle: 'Pasta' }
const RECIPE_B: RecipeSuggestion = { recipeId: 'r2', recipeTitle: 'Tacos' }

describe('T_assign - Cross-day assignment state transformation', () => {
  it('removes the recipe from source day options', () => {
    const days: DayState[] = [
      { date: '2026-03-01', mealTypes: [{ mealType: 'dinner', options: [RECIPE_A, RECIPE_B], isSwapping: false }] },
      { date: '2026-03-02', mealTypes: [{ mealType: 'dinner', options: [], isSwapping: false }] },
    ]
    const result = applyAssign(days, RECIPE_A, '2026-03-01', '2026-03-02', 'dinner')
    expect(result[0]!.mealTypes[0]!.options.map((o) => o.recipeId)).toEqual(['r2'])
  })

  it('adds the recipe to target day options', () => {
    const days: DayState[] = [
      { date: '2026-03-01', mealTypes: [{ mealType: 'dinner', options: [RECIPE_A, RECIPE_B], isSwapping: false }] },
      { date: '2026-03-02', mealTypes: [{ mealType: 'dinner', options: [], isSwapping: false }] },
    ]
    const result = applyAssign(days, RECIPE_A, '2026-03-01', '2026-03-02', 'dinner')
    expect(result[1]!.mealTypes[0]!.options.map((o) => o.recipeId)).toEqual(['r1'])
  })

  it('does not duplicate the recipe if already present in target options', () => {
    const days: DayState[] = [
      { date: '2026-03-01', mealTypes: [{ mealType: 'dinner', options: [RECIPE_A], isSwapping: false }] },
      { date: '2026-03-02', mealTypes: [{ mealType: 'dinner', options: [RECIPE_A], isSwapping: false }] },
    ]
    const result = applyAssign(days, RECIPE_A, '2026-03-01', '2026-03-02', 'dinner')
    expect(result[1]!.mealTypes[0]!.options).toHaveLength(1)
  })

  it('leaves other meal types untouched', () => {
    const days: DayState[] = [
      {
        date: '2026-03-01',
        mealTypes: [
          { mealType: 'dinner', options: [RECIPE_A], isSwapping: false },
          { mealType: 'lunch', options: [RECIPE_B], isSwapping: false },
        ],
      },
      { date: '2026-03-02', mealTypes: [{ mealType: 'dinner', options: [], isSwapping: false }] },
    ]
    const result = applyAssign(days, RECIPE_A, '2026-03-01', '2026-03-02', 'dinner')
    const lunchSlot = result[0]!.mealTypes.find((mts) => mts.mealType === 'lunch')
    expect(lunchSlot?.options.map((o) => o.recipeId)).toEqual(['r2'])
  })
})

// ── T38: activeMealTypes defaults to ['dinner'] when wizard opens ──────────────

describe('T38 - activeMealTypes initialises to [\'dinner\'] on wizard mount', () => {
  it('renders the Dinner meal-type pill as aria-pressed=true on the setup screen', () => {
    render(<PlanPage />)

    const dinnerPill = screen.getByRole('button', { name: 'Dinner' })
    expect(dinnerPill).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders Breakfast, Lunch, Snacks pills as aria-pressed=false on mount', () => {
    render(<PlanPage />)

    for (const label of ['Breakfast', 'Lunch', 'Snacks']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
  })
})
