'use client'

import { useState } from 'react'
import DayCard, { type MealTypeState } from './DayCard'
import GroceryPreview from './GroceryPreview'
import { formatWeekRange } from '@/lib/date-utils'
import type { RecipeSuggestion, MealType, PlanSetup, SelectionsMap } from '@/types'

interface DayState {
  date:        string
  mealTypes:   MealTypeState[]
  whyThisDay?: string
}

interface SuggestionsState {
  days: DayState[]
}

interface SuggestionsScreenProps {
  setup:            PlanSetup
  suggestions:      SuggestionsState
  selections:       SelectionsMap
  onSelect:         (date: string, mealType: MealType, recipe: RecipeSuggestion) => void
  onSkipSlot:       (date: string, mealType: MealType) => void
  onSwapSlot:       (date: string, mealType: MealType) => void
  onAssignToDay:    (recipe: RecipeSuggestion, sourceDate: string, targetDate: string, mealType: MealType) => void
  onVaultPick:      (date: string, mealType: MealType, recipe: { recipeId: string; recipeTitle: string }) => void
  onFreeTextMatch:  (query: string, date: string, mealType: MealType) => Promise<{ matched: boolean }>
  onSideDishPick?:  (date: string, mealType: MealType, recipe: { recipeId: string; recipeTitle: string }) => void
  onSideDishRemove?:(date: string, mealType: MealType) => void
  onDessertPick?:   (date: string, mealType: MealType, recipe: { recipeId: string; recipeTitle: string }) => void
  onDessertRemove?: (date: string, mealType: MealType) => void
  onRegenerate:     (onlyUnselected?: boolean) => void
  onSaveAndGrocery: () => Promise<void>
  onSaveOnly:       () => Promise<void>
  isSaving:         boolean
  onBack:           () => void
}

type RegeneratePromptState = 'none' | 'prompt'

export default function SuggestionsScreen({
  setup, suggestions, selections,
  onSelect, onSkipSlot, onSwapSlot, onAssignToDay, onVaultPick, onFreeTextMatch,
  onSideDishPick, onSideDishRemove, onDessertPick, onDessertRemove,
  onRegenerate, onSaveAndGrocery, onSaveOnly, isSaving, onBack,
}: SuggestionsScreenProps) {
  const [regenPrompt, setRegenPrompt] = useState<RegeneratePromptState>('none')
  const [saveError, setSaveError] = useState('')

  const confirmedCount = Object.values(selections).filter((v) => v !== undefined && v !== null).length
  const hasSelections = confirmedCount > 0

  // Count unique confirmed dates
  const confirmedDates = new Set(
    Object.entries(selections)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([key]) => key.split(':')[0])
  )

  const handleRegenerateClick = () => {
    if (hasSelections) {
      setRegenPrompt('prompt')
    } else {
      onRegenerate()
    }
  }

  const handleSaveAndGrocery = async () => {
    setSaveError('')
    try {
      await onSaveAndGrocery()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  const handleSaveOnly = async () => {
    setSaveError('')
    try {
      await onSaveOnly()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  const sortedDays = [...suggestions.days].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <>
      <div className="pb-40">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-stone-400 hover:text-stone-600 transition-colors"
              aria-label="Back to setup"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="font-display text-base font-semibold text-stone-700">
              Suggestions for {formatWeekRange(setup.weekStart)}
            </h2>
          </div>
        </div>

        {/* Day cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sortedDays.map((day) => (
            <DayCard
              key={day.date}
              date={day.date}
              mealTypeSuggestions={day.mealTypes}
              whyThisDay={day.whyThisDay}
              selections={selections}
              activeMealTypes={setup.activeMealTypes}
              activeDates={setup.activeDates}
              onSelect={onSelect}
              onSkip={onSkipSlot}
              onSwap={onSwapSlot}
              onAssignToDay={onAssignToDay}
              onVaultPick={onVaultPick}
              onFreeTextMatch={onFreeTextMatch}
              onSideDishPick={onSideDishPick}
              onSideDishRemove={onSideDishRemove}
              onDessertPick={onDessertPick}
              onDessertRemove={onDessertRemove}
            />
          ))}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 bg-stone-50 border-t border-stone-200 px-4 py-4 z-10 -mx-4 md:-mx-8">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Grocery preview */}
          <GroceryPreview
            confirmedCount={confirmedCount}
            totalDays={confirmedDates.size}
          />

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}

          <div className="flex items-center justify-between gap-3">
            {/* Regenerate — left side */}
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

            {/* Save buttons — right side */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveOnly}
                disabled={confirmedCount === 0 || isSaving}
                className="text-sm font-medium text-stone-500 hover:text-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save Plan Only
              </button>
              <button
                onClick={handleSaveAndGrocery}
                disabled={confirmedCount === 0 || isSaving}
                className="font-display text-sm font-medium bg-sage-500 text-white px-4 py-2 rounded-lg hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Saving…
                  </>
                ) : (
                  'Save & Build Grocery List'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
