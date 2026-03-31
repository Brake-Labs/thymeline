'use client'

import Link from 'next/link'
import MealSlot from './MealSlot'
import { getDayAbbrev, formatShortDate as getMonthDay, isTodayLocal as isTodayDate } from '@/lib/date-utils'
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

export default function DayCard({ date, entries, isExpanded, onToggle, onAddEntry, onDeleteEntry }: DayCardProps) {
  const mealCount = entries.filter((e) => !e.is_side_dish).length
  const summaryText = mealCount > 0
    ? `${mealCount} meal${mealCount !== 1 ? 's' : ''} planned`
    : 'Nothing planned'
  const today = isTodayDate(date)

  return (
    <div className="bg-[#FFFDF9] border border-stone-200 rounded overflow-hidden">
      {/* Top accent bar */}
      <div className="h-[3px] bg-sage-500" />

      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
          isExpanded ? 'bg-sage-500' : 'hover:bg-stone-50'
        }`}
        aria-expanded={isExpanded}
      >
        <div>
          <p className={`text-[9px] font-display font-bold uppercase tracking-[0.1em] ${
            isExpanded ? 'text-white/70' : 'text-stone-400'
          }`}>
            {getDayAbbrev(date)}
          </p>
          <p className={`text-lg font-display font-bold leading-tight mt-0.5 ${
            isExpanded ? 'text-white' : today ? 'text-sage-500' : 'text-[#1F2D26]'
          }`}>
            {getMonthDay(date)}
          </p>
        </div>
        <span className={`text-xs ${isExpanded ? 'text-white/70' : 'text-stone-400'}`}>
          {summaryText}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-dashed border-stone-200 px-4 py-3">
          {entries.length === 0 && (
            <p className="text-sm text-stone-400 mb-3">
              Nothing planned —{' '}
              <Link href="/plan" className="text-sage-500 hover:underline">
                Help Me Plan
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
              onAdd={(recipeId, recipeTitle, isSideDish, parentEntryId, mealTypeOverride) =>
                onAddEntry(date, mealTypeOverride ?? mealType, recipeId, recipeTitle, isSideDish, parentEntryId)
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
