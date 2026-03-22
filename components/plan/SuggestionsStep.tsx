'use client'

import { useState } from 'react'
import SuggestionDayRow from './SuggestionDayRow'
import type { RecipeSuggestion, DaySelection } from '@/types'

interface PlanSetup {
  weekStart:        string
  activeDates:      string[]
  preferThisWeek:   string[]
  avoidThisWeek:    string[]
  freeText:         string
  specificRequests: string
}

interface DayState {
  date:       string
  options:    RecipeSuggestion[]
  isSwapping: boolean
}

interface SuggestionsState {
  days: DayState[]
}

type SelectionsMap = Record<string, DaySelection | null>

interface SuggestionsStepProps {
  setup:          PlanSetup
  suggestions:    SuggestionsState
  selections:     SelectionsMap
  onSelect:       (date: string, recipe: RecipeSuggestion) => void
  onSkipDay:      (date: string) => void
  onSwapDay:      (date: string) => void
  onAssignToDay:  (recipe: RecipeSuggestion, targetDate: string) => void
  onVaultPick:    (date: string, recipe: DaySelection) => void
  onFreeTextMatch:(query: string, date: string) => Promise<{ matched: boolean }>
  onRegenerate:   (onlyUnselected?: boolean) => void
  onConfirm:      () => void
  onBack:         () => void
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00Z')
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${fmt(start)} – ${fmt(end)}`
}

type RegeneratePromptState = 'none' | 'prompt'

export default function SuggestionsStep({
  setup, suggestions, selections,
  onSelect, onSkipDay, onSwapDay, onAssignToDay, onVaultPick, onFreeTextMatch,
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
    <div className="space-y-4 max-w-2xl">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="font-display text-base font-semibold text-stone-700">
          Suggestions for {formatWeekRange(setup.weekStart)}
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={handleRegenerateClick}
              className="text-sm font-medium text-stone-600 border border-stone-300 px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors"
            >
              Regenerate
            </button>
            {regenPrompt === 'prompt' && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setRegenPrompt('none')} aria-hidden="true" />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-stone-200 rounded-xl shadow-lg p-3 min-w-[220px]">
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
                    Regenerate unselected days only
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={onConfirm}
            disabled={confirmedCount === 0}
            className="font-display text-sm font-medium bg-sage-500 text-white px-4 py-2 rounded-lg hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Confirm Plan
          </button>
        </div>
      </div>

      {/* Day rows */}
      {sortedDays.map((day) => (
        <SuggestionDayRow
          key={day.date}
          date={day.date}
          options={day.options}
          selection={selections[day.date]}
          isSwapping={day.isSwapping}
          activeDates={setup.activeDates}
          onSelect={onSelect}
          onSkip={onSkipDay}
          onSwap={onSwapDay}
          onAssignToDay={onAssignToDay}
          onVaultPick={onVaultPick}
          onFreeTextMatch={onFreeTextMatch}
        />
      ))}

      <button
        onClick={onBack}
        className="text-sm text-stone-500 hover:text-stone-700 underline transition-colors"
      >
        ← Back to setup
      </button>
    </div>
  )
}
