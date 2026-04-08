'use client'

import SuggestionMealSlotRow from './SuggestionMealSlotRow'
import type { RecipeSuggestion, DaySelection, MealType } from '@/types'

export interface MealTypeState {
  mealType:  MealType
  options:    RecipeSuggestion[]
  isSwapping: boolean
}

interface SuggestionDayRowProps {
  date:               string
  mealTypeSuggestions: MealTypeState[]
  selections:         Record<string, DaySelection | null>  // composite keys "date:mealType"
  activeMealTypes:    MealType[]
  activeDates:        string[]
  onSelect:           (date: string, mealType: MealType, recipe: RecipeSuggestion) => void
  onSkip:             (date: string, mealType: MealType) => void
  onSwap:             (date: string, mealType: MealType) => void
  onAssignToDay:      (recipe: RecipeSuggestion, sourceDate: string, targetDate: string, mealType: MealType) => void
  onVaultPick:        (date: string, mealType: MealType, recipe: { recipeId: string; recipeTitle: string }) => void
  onFreeTextMatch:    (query: string, date: string, mealType: MealType) => Promise<{ matched: boolean }>
  onSideDishPick?:    (date: string, mealType: MealType, recipe: { recipeId: string; recipeTitle: string }) => void
  onSideDishRemove?:  (date: string, mealType: MealType) => void
  onDessertPick?:     (date: string, mealType: MealType, recipe: { recipeId: string; recipeTitle: string }) => void
  onDessertRemove?:   (date: string, mealType: MealType) => void
}

const MEAL_TYPE_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }

function formatDayHeader(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

export default function SuggestionDayRow({
  date, mealTypeSuggestions, selections, activeMealTypes, activeDates,
  onSelect, onSkip, onSwap, onAssignToDay, onVaultPick, onFreeTextMatch,
  onSideDishPick, onSideDishRemove, onDessertPick, onDessertRemove,
}: SuggestionDayRowProps) {
  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
      {/* Day header */}
      <div className="px-4 py-3 bg-stone-50 border-b border-stone-200">
        <span className="text-sm font-semibold text-stone-700">{formatDayHeader(date)}</span>
      </div>

      {/* One slot per active meal type, ordered breakfast → lunch → dinner → snacks */}
      <div className="px-4 py-3 space-y-2">
        {[...activeMealTypes].sort((a, b) => (MEAL_TYPE_ORDER[a] ?? 99) - (MEAL_TYPE_ORDER[b] ?? 99)).map((mt) => {
          const slotState = mealTypeSuggestions.find((s) => s.mealType === mt)
          const compositeKey = `${date}:${mt}`
          return (
            <SuggestionMealSlotRow
              key={mt}
              date={date}
              mealType={mt}
              options={slotState?.options ?? []}
              selection={selections[compositeKey]}
              isSwapping={slotState?.isSwapping ?? false}
              activeDates={activeDates}
              onSelect={onSelect}
              onSkip={onSkip}
              onSwap={onSwap}
              onAssignToDay={onAssignToDay}
              onVaultPick={onVaultPick}
              onFreeTextMatch={onFreeTextMatch}
              onSideDishPick={onSideDishPick}
              onSideDishRemove={onSideDishRemove}
              onDessertPick={onDessertPick}
              onDessertRemove={onDessertRemove}
            />
          )
        })}
      </div>
    </div>
  )
}
