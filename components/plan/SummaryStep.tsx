'use client'

import { useState } from 'react'
import type { DaySelection } from '@/types'

interface PlanSetup {
  weekStart:   string
  activeDates: string[]
}

interface SummaryStepProps {
  setup:      PlanSetup
  selections: Record<string, DaySelection | null>
  onSave:     () => Promise<void>
  isSaving:   boolean
  onBack:     () => void
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00Z')
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${fmt(start)} – ${fmt(end)}`
}

function formatDayName(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function formatShortDay(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', timeZone: 'UTC',
  })
}

export default function SummaryStep({ setup, selections, onSave, isSaving, onBack }: SummaryStepProps) {
  const [saveError, setSaveError] = useState('')

  const activeDates = [...setup.activeDates].sort()

  // Confirmed: active days with a non-null, non-undefined selection
  const confirmed = activeDates.filter((d) => selections[d] !== undefined && selections[d] !== null)
  // Skipped: active days with selection === null
  const skipped = activeDates.filter((d) => selections[d] === null)

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
      <h2 className="text-lg font-semibold text-stone-800">
        Your plan for {formatWeekRange(setup.weekStart)}
      </h2>

      {/* Confirmed days */}
      {confirmed.length > 0 && (
        <div className="space-y-2">
          {confirmed.map((date) => {
            const sel = selections[date] as DaySelection
            return (
              <div key={date} className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0">
                <span className="text-sm text-stone-600 w-36 flex-shrink-0">{formatDayName(date)}</span>
                <span className="text-sm font-medium text-stone-800">{sel.recipe_title}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Skipped days */}
      {skipped.length > 0 && (
        <p className="text-sm text-stone-400">
          Skipping: {skipped.map(formatShortDay).join(', ')}
        </p>
      )}

      {/* Save button */}
      <div className="space-y-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full sm:w-auto px-6 py-3 bg-sage-500 text-white font-medium text-sm rounded-lg hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
          className="text-sm text-stone-500 hover:text-stone-700 underline block transition-colors"
        >
          Go back
        </button>
      </div>
    </div>
  )
}
