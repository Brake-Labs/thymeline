'use client'

import { useState } from 'react'
import SuggestionDayRow, { type MealTypeState } from './SuggestionDayRow'
import { formatWeekRange } from '@/lib/date-utils'
import type { RecipeSuggestion, MealType, PlanSetup, SelectionsMap } from '@/types'

interface DayState {
  date:       string
  meal_types: MealTypeState[]
}

interface SuggestionsState {
  days: DayState[]
}

interface SuggestionsStepProps {
  setup:            PlanSetup
  suggestions:      SuggestionsState
  selections:       SelectionsMap
  onSelect:         (date: string, mealType: MealType, recipe: RecipeSuggestion) => void
  onSkipSlot:       (date: string, mealType: MealType) => void
  onSwapSlot:       (date: string, mealType: MealType) => void
  onAssignToDay:    (recipe: RecipeSuggestion, sourceDate: string, targetDate: string, mealType: MealType) => void
  onVaultPick:      (date: string, mealType: MealType, recipe: { recipe_id: string; recipe_title: string }) => void
  onFreeTextMatch:  (query: string, date: string, mealType: MealType) => Promise<{ matched: boolean }>
  onDessertPick?:   (date: string, mealType: MealType, recipe: { recipe_id: string; recipe_title: string }) => void
  onDessertRemove?: (date: string, mealType: MealType) => void
  onRegenerate:     (onlyUnselected?: boolean) => void
  onConfirm:        () => void
  onBack:           () => void
}

type RegeneratePromptState = 'none' | 'prompt'

export default function SuggestionsStep({
  setup, suggestions, selections,
  onSelect, onSkipSlot, onSwapSlot, onAssignToDay, onVaultPick, onFreeTextMatch,
  onDessertPick, onDessertRemove,
  onRegenerate, onConfirm, onBack,
}: SuggestionsStepProps) {
  const [regenPrompt, setRegenPrompt] = useState<RegeneratePromptState>('none')

  const hasSelections = Object.values(selections).some((v) => v !== undefined && v !== null)
  const confirmedCount = Object.values(selections).filter((v) => v !== undefined && v !== null).length

  const handleRegenerateClick = () => {
    if (hasSelections) {
      setRegenPrompt('prompt')
    } else {
      onRegenerate()
    }
  }

  const sortedDays = [...suggestions.days].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <>
      <div className="space-y-4 max-w-2xl pb-20">
        {/* Top bar — week label only */}
        <h2 className="font-display text-base font-semibold text-stone-700">
          Suggestions for {formatWeekRange(setup.weekStart)}
        </h2>

        {/* Day rows */}
        {sortedDays.map((day) => (
          <SuggestionDayRow
            key={day.date}
            date={day.date}
            mealTypeSuggestions={day.meal_types}
            selections={selections}
            activeMealTypes={setup.activeMealTypes}
            activeDates={setup.activeDates}
            onSelect={onSelect}
            onSkip={onSkipSlot}
            onSwap={onSwapSlot}
            onAssignToDay={onAssignToDay}
            onVaultPick={onVaultPick}
            onFreeTextMatch={onFreeTextMatch}
            onDessertPick={onDessertPick}
            onDessertRemove={onDessertRemove}
          />
        ))}

        <button
          onClick={onBack}
          className="text-sm font-medium border border-sage-300 text-sage-700 bg-transparent px-4 py-2 rounded-lg hover:bg-sage-50 transition-colors"
        >
          ← Back to setup
        </button>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 bg-stone-50 border-t border-stone-200 px-4 py-4 z-10 -mx-4 md:-mx-8">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          {/* Regenerate — ghost sage, left side */}
          <div className="relative">
            <button
              onClick={handleRegenerateClick}
              className="text-sm font-medium border border-sage-300 text-sage-700 bg-transparent px-4 py-2 rounded-lg hover:bg-sage-50 transition-colors"
            >
              Regenerate
            </button>
            {regenPrompt === 'prompt' && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setRegenPrompt('none')} aria-hidden="true" />
                <div className="absolute left-0 bottom-full mb-1 z-20 bg-white border border-stone-200 rounded-xl shadow-lg p-3 min-w-[220px]">
                  <p className="text-xs text-stone-500 mb-2">You have existing selections.</p>
                  <button
                    onClick={() => { setRegenPrompt('none'); onRegenerate(false) }}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-stone-50 text-stone-700 transition-colors"
                  >
                    Regenerate all days
                  </button>
                  <button
                    onClick={() => { setRegenPrompt('none'); onRegenerate(true) }}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-stone-50 text-stone-700 transition-colors"
                  >
                    Regenerate unselected slots only
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Confirm Plan — sage primary, right side */}
          <button
            onClick={onConfirm}
            disabled={confirmedCount === 0}
            className="font-display text-sm font-medium bg-sage-500 text-white px-4 py-2 rounded-lg hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Confirm Plan
          </button>
        </div>
      </div>
    </>
  )
}
