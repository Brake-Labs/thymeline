'use client'

import { useState } from 'react'
import MealCard from './MealCard'
import SwapModeBanner from './SwapModeBanner'
import SwapToast from './SwapToast'

export interface WeekCalendarViewEntry {
  id: string
  plannedDate: string
  recipeTitle: string
  mealType: string
  confirmed: boolean
}

interface WeekCalendarViewProps {
  entries: WeekCalendarViewEntry[]
  weekStart: string
}

export default function WeekCalendarView({ entries, weekStart: _weekStart }: WeekCalendarViewProps) {
  const [isSwapMode, setIsSwapMode] = useState(false)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [localEntries, setLocalEntries] = useState(entries)
  const [swapToast, setSwapToast] = useState<{ entryIdA: string; entryIdB: string } | null>(null)
  const [swapError, setSwapError] = useState<string | null>(null)

  function handleMealCardTap(entryId: string) {
    if (!isSwapMode) return
    if (selectedEntryId === null) {
      setSelectedEntryId(entryId)
    } else if (selectedEntryId === entryId) {
      setSelectedEntryId(null)
    } else {
      performSwap(selectedEntryId, entryId)
    }
  }

  async function performSwap(idA: string, idB: string) {
    setIsSwapMode(false)
    setSelectedEntryId(null)
    setSwapError(null)

    // Snapshot for rollback
    const prev = localEntries

    // Optimistic update — swap planned_dates
    setLocalEntries((curr) => {
      const next = curr.map((e) => {
        if (e.id === idA) {
          const other = curr.find((x) => x.id === idB)
          return other ? { ...e, plannedDate: other.plannedDate } : e
        }
        if (e.id === idB) {
          const other = curr.find((x) => x.id === idA)
          return other ? { ...e, plannedDate: other.plannedDate } : e
        }
        return e
      })
      return next
    })

    try {
      const res = await fetch('/api/plan/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entryIdA: idA, entryIdB: idB }),
      })

      if (!res.ok) {
        throw new Error('Swap failed')
      }

      setSwapToast({ entryIdA: idA, entryIdB: idB })
    } catch {
      // Revert on failure
      setLocalEntries(prev)
      setSwapError('Swap failed. Please try again.')
    }
  }

  return (
    <div className="space-y-3">
      {/* Swap button */}
      <div className="flex justify-end">
        {!isSwapMode && (
          <button
            onClick={() => setIsSwapMode(true)}
            className="font-display text-sm font-semibold text-sage-600 hover:text-sage-800 border border-sage-300 rounded-lg px-3 py-1.5 hover:bg-sage-50 transition-colors"
          >
            Swap meals
          </button>
        )}
      </div>

      {/* Swap mode banner */}
      {isSwapMode && (
        <SwapModeBanner
          hasSelection={selectedEntryId !== null}
          onCancel={() => {
            setIsSwapMode(false)
            setSelectedEntryId(null)
          }}
        />
      )}

      {/* Error message */}
      {swapError && (
        <p className="text-sm text-red-600">{swapError}</p>
      )}

      {/* Meal cards */}
      {localEntries.length === 0 ? (
        <p className="text-stone-500">No recipes planned for this week.</p>
      ) : (
        <div className="space-y-2">
          {localEntries.map((entry) => (
            <MealCard
              key={entry.id}
              id={entry.id}
              plannedDate={entry.plannedDate}
              recipeTitle={entry.recipeTitle}
              mealType={entry.mealType}
              confirmed={entry.confirmed}
              isSwapMode={isSwapMode}
              isSelected={selectedEntryId === entry.id}
              onTap={handleMealCardTap}
            />
          ))}
        </div>
      )}

      {/* Undo toast */}
      {swapToast && (
        <SwapToast
          entryIdA={swapToast.entryIdA}
          entryIdB={swapToast.entryIdB}
          onUndo={(idA, idB) => {
            performSwap(idA, idB)
          }}
          onDismiss={() => setSwapToast(null)}
        />
      )}
    </div>
  )
}
