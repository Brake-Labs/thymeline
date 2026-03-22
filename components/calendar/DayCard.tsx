'use client'

import Link from 'next/link'
import MealSlot from './MealSlot'
import type { PlanEntry, MealType } from '@/types'

const MEAL_TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

interface DayCardProps {
  date:          string
  entries:       PlanEntry[]
  isExpanded:    boolean
  onToggle:      () => void
  onAddEntry:    (date: string, mealType: MealType, recipeId: string, recipeTitle: string, isSideDish?: boolean, parentEntryId?: string) => void
  onDeleteEntry: (entryId: string) => void
}

function formatDayLabel(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

export default function DayCard({ date, entries, isExpanded, onToggle, onAddEntry, onDeleteEntry }: DayCardProps) {
  const mealCount = entries.filter((e) => !e.is_side_dish).length
  const summaryText = mealCount > 0
    ? `${mealCount} meal${mealCount !== 1 ? 's' : ''} planned`
    : 'Nothing planned'

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-stone-50 transition-colors"
        aria-expanded={isExpanded}
      >
        <span className="text-sm font-semibold text-stone-700">{formatDayLabel(date)}</span>
        <span className="text-xs text-stone-400">{summaryText}</span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-stone-100 px-4 py-3">
          {entries.length === 0 && (
            <p className="text-sm text-stone-400 mb-3">
              Nothing planned —{' '}
              <Link href="/plan" className="text-sage-500 hover:underline">
                use Help Me Plan
              </Link>
            </p>
          )}
          {MEAL_TYPE_ORDER.map((mealType) => (
            <MealSlot
              key={mealType}
              mealType={mealType}
              entries={entries.filter((e) =>
                e.meal_type === mealType ||
                (e.is_side_dish && entries.find((p) => p.id === e.parent_entry_id)?.meal_type === mealType)
              )}
              onAdd={(recipeId, recipeTitle, isSideDish, parentEntryId) =>
                onAddEntry(date, mealType, recipeId, recipeTitle, isSideDish, parentEntryId)
              }
              onDelete={onDeleteEntry}
              onAddSideDish={(parentEntryId) => {
                // Handled internally by MealSlot via the side dish vault sheet
                void parentEntryId
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
