'use client'

import Link from 'next/link'
import MealSlot from './MealSlot'
import { getDayAbbrev, formatShortDate as getMonthDay, isTodayLocal as isTodayDate } from '@/lib/date-utils'
import type { PlanEntry, MealType } from '@/types'

const MEAL_TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

interface DayCardProps {
  date:            string
  entries:         PlanEntry[]
  isExpanded:      boolean
  onToggle:        () => void
  onAddEntry:      (date: string, mealType: MealType, recipeId: string, recipeTitle: string, isSideDish?: boolean, parentEntryId?: string) => void
  onDeleteEntry:   (entryId: string) => void
  isSwapMode?:     boolean
  selectedEntryId?: string | null
  onMealTap?:      (entryId: string) => void
  weekStart?:      string
}

export default function DayCard({ date, entries, isExpanded, onToggle, onAddEntry, onDeleteEntry, isSwapMode, selectedEntryId, onMealTap, weekStart }: DayCardProps) {
  const mealCount = entries.filter((e) => !e.isSideDish).length
  const summaryText = mealCount > 0
    ? `${mealCount} meal${mealCount !== 1 ? 's' : ''} planned`
    : 'Nothing planned'
  const today = isTodayDate(date)

  return (
    <div className="bg-[#FFFDF9] border border-stone-200 rounded-[4px] border-t-[3px] border-t-sage-500 overflow-hidden">
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
            isExpanded ? 'text-sage-100/70' : 'text-stone-500'
          }`}>
            {getDayAbbrev(date)}
          </p>
          <p className={`text-lg font-display font-bold leading-tight mt-0.5 ${
            isExpanded ? 'text-stone-50' : today ? 'text-sage-500' : 'text-sage-900'
          }`}>
            {getMonthDay(date)}
          </p>
        </div>
        <span className={`font-sans text-xs ${isExpanded ? 'text-sage-100/70' : 'text-stone-400'}`}>
          {summaryText}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-dashed border-stone-200 px-4 py-3">
          {entries.length === 0 && (
            <p className="font-sans text-sm text-stone-400 mb-3">
              Nothing planned —{' '}
              <Link href={weekStart ? `/plan?weekStart=${weekStart}` : '/plan'} className="text-sage-500 hover:underline">
                Help Me Plan
              </Link>
            </p>
          )}
          {MEAL_TYPE_ORDER.map((mealType) => (
            <MealSlot
              key={mealType}
              mealType={mealType}
              date={date}
              entries={entries.filter((e) =>
                e.mealType === mealType ||
                (e.isSideDish && entries.find((p) => p.id === e.parentEntryId)?.mealType === mealType)
              )}
              onAdd={(recipeId, recipeTitle, isSideDish, parentEntryId, mealTypeOverride) =>
                onAddEntry(date, mealTypeOverride ?? mealType, recipeId, recipeTitle, isSideDish, parentEntryId)
              }
              onDelete={onDeleteEntry}
              onAddSideDish={(parentEntryId) => {
                // Handled internally by MealSlot via the side dish vault sheet
                void parentEntryId
              }}
              isSwapMode={isSwapMode}
              selectedEntryId={selectedEntryId}
              onMealTap={onMealTap}
            />
          ))}
        </div>
      )}
    </div>
  )
}
