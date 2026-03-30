'use client'

import { useState } from 'react'
import { formatWeekRange, formatDayName, formatWeekday as formatShortDay } from '@/lib/date-utils'
import type { DaySelection, MealType } from '@/types'

interface PlanSetup {
  weekStart:       string
  activeDates:     string[]
  activeMealTypes: MealType[]
}

interface SummaryStepProps {
  setup:      PlanSetup
  selections: Record<string, DaySelection | null>  // composite keys "date:mealType"
  onSave:     () => Promise<void>
  isSaving:   boolean
  onBack:     () => void
}

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch:     'Lunch',
  dinner:    'Dinner',
  snack:     'Snacks',
  dessert:   'Dessert',
}

export default function SummaryStep({ setup, selections, onSave, isSaving, onBack }: SummaryStepProps) {
  const [saveError, setSaveError] = useState('')

  // Build confirmed entries from composite keys
  const confirmed: { date: string; mealType: MealType; sel: DaySelection }[] = []
  const skippedSlots: { date: string; mealType: MealType }[] = []

  for (const [key, val] of Object.entries(selections)) {
    const colonIdx = key.indexOf(':')
    if (colonIdx === -1) continue
    const date = key.slice(0, colonIdx)
    const mealType = key.slice(colonIdx + 1) as MealType
    if (val !== undefined && val !== null) {
      confirmed.push({ date, mealType, sel: val })
    } else if (val === null) {
      skippedSlots.push({ date, mealType })
    }
  }

  confirmed.sort((a, b) => a.date.localeCompare(b.date) || a.mealType.localeCompare(b.mealType))
  skippedSlots.sort((a, b) => a.date.localeCompare(b.date) || a.mealType.localeCompare(b.mealType))

  // Group confirmed by date for display
  const byDate = confirmed.reduce<Record<string, typeof confirmed>>((acc, item) => {
    if (!acc[item.date]) acc[item.date] = []
    acc[item.date]!.push(item)
    return acc
  }, {})
  const sortedDates = Object.keys(byDate).sort()

  const handleSave = async () => {
    setSaveError('')
    try {
      await onSave()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="font-display text-lg font-semibold text-stone-800">
        Your plan for {formatWeekRange(setup.weekStart)}
      </h2>

      {/* Confirmed entries */}
      {sortedDates.length > 0 && (
        <div className="space-y-3">
          {sortedDates.map((date) => (
            <div key={date}>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1">
                {formatDayName(date)}
              </p>
              {byDate[date]?.map(({ mealType, sel }) => (
                <div
                  key={`${date}:${mealType}`}
                  className="flex items-center gap-3 py-1.5 border-b border-stone-100 last:border-0"
                >
                  <span className="text-xs text-stone-400 w-20 flex-shrink-0">{MEAL_TYPE_LABELS[mealType]}</span>
                  <span className="text-sm font-medium text-stone-800">{sel.recipe_title}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Skipped slots */}
      {skippedSlots.length > 0 && (
        <p className="text-sm text-stone-400">
          Skipping:{' '}
          {skippedSlots.map((s) => `${formatShortDay(s.date)} (${MEAL_TYPE_LABELS[s.mealType]})`).join(', ')}
        </p>
      )}

      {/* Save button */}
      <div className="space-y-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="font-display w-full sm:w-auto px-6 py-3 bg-sage-500 text-white font-medium text-sm rounded-lg hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Saving…
            </>
          ) : (
            'Looks good — save my plan'
          )}
        </button>

        {saveError && <p className="text-sm text-red-600">{saveError}</p>}

        <button
          onClick={onBack}
          className="text-sm font-medium border border-sage-300 text-sage-700 bg-transparent px-4 py-2 rounded-lg hover:bg-sage-50 transition-colors"
        >
          Go back
        </button>
      </div>
    </div>
  )
}
