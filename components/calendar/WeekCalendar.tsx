'use client'

import { useState, useEffect, useCallback } from 'react'
import DayCard from './DayCard'
import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import SwapModeBanner from '@/components/plan/SwapModeBanner'
import SwapToast from '@/components/plan/SwapToast'
import { getMostRecentSunday, getMostRecentWeekStart, addWeeks, addDays, getWeekDates, formatWeekRange } from '@/lib/date-utils'
import type { PlanEntry, MealType } from '@/types'

export default function WeekCalendar() {
  // Start with Sunday as default; updated to user preference once prefs load
  const [weekStartDay, setWeekStartDay] = useState(0)
  const defaultStart = getMostRecentSunday()
  const [weekStart, setWeekStart] = useState(defaultStart)
  const [entries, setEntries] = useState<PlanEntry[]>([])
  const [expandedDates, setExpandedDates] = useState<Set<string>>(
    () => new Set(getWeekDates(defaultStart))
  )
  const [loading, setLoading] = useState(false)
  const [isSwapMode, setIsSwapMode] = useState(false)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [swapToast, setSwapToast] = useState<{ entryIdA: string; entryIdB: string } | null>(null)
  const [swapError, setSwapError] = useState<string | null>(null)

  const currentWeekStart = getMostRecentWeekStart(weekStartDay)
  const maxWeekStart = addWeeks(currentWeekStart, 4)
  const isAtMaxFuture = weekStart >= maxWeekStart

  // Load week_start_day preference once on mount
  useEffect(() => {
    async function loadPref() {
      try {
        const res = await fetch('/api/preferences')
        if (res.ok) {
          const prefs = await res.json()
          const raw = prefs.week_start_day ?? 'sunday'
          const pref: number = raw === 'monday' ? 1 : typeof raw === 'number' ? raw : 0
          if (pref !== 0) {
            setWeekStartDay(pref)
            const start = getMostRecentWeekStart(pref)
            setWeekStart(start)
            setExpandedDates(new Set(getWeekDates(start)))
          }
        }
      } catch { /* silently fail — default to Sunday */ }
    }
    void loadPref()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPlan = useCallback(async (ws: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/plan?week_start=${ws}`)
      if (res.ok) {
        const data = await res.json()
        setEntries((data.plan?.entries ?? []) as PlanEntry[])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPlan(weekStart)
    setExpandedDates(new Set(getWeekDates(weekStart)))
  }, [weekStart, fetchPlan])

  const handlePrevWeek = () => {
    setIsSwapMode(false)
    setSelectedEntryId(null)
    setWeekStart((ws) => addWeeks(ws, -1))
  }
  const handleNextWeek = () => {
    if (!isAtMaxFuture) {
      setIsSwapMode(false)
      setSelectedEntryId(null)
      setWeekStart((ws) => addWeeks(ws, 1))
    }
  }

  const handleToggle = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev)
      if (next.has(date)) { next.delete(date) } else { next.add(date) }
      return next
    })
  }

  const handleAddEntry = async (
    date: string,
    mealType: MealType,
    recipeId: string,
    recipeTitle: string,
    isSideDish = false,
    parentEntryId?: string,
  ) => {
    // Optimistically: if adding a main dish to an occupied slot, remove old main + its side dishes
    if (!isSideDish) {
      const existingMain = entries.find(
        (e) => e.planned_date === date && e.meal_type === mealType && !e.is_side_dish
      )
      if (existingMain) {
        // Remove existing main and its side dishes first
        const toDelete = [existingMain.id, ...entries.filter((e) => e.parent_entry_id === existingMain.id).map((e) => e.id)]
        for (const id of toDelete) {
          try {
            await fetch(`/api/plan/entries/${id}`, {
              method: 'DELETE',
            })
          } catch { /* ignore */ }
        }
        setEntries((prev) => prev.filter((e) => !toDelete.includes(e.id)))
      }
    }

    try {
      const res = await fetch('/api/plan/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start:      weekStart,
          date,
          recipe_id:       recipeId,
          meal_type:       mealType,
          is_side_dish:    isSideDish,
          parent_entry_id: parentEntryId,
        }),
      })
      if (res.ok) {
        const newEntry = await res.json() as PlanEntry
        setEntries((prev) => [...prev, newEntry])
      }
    } catch { /* ignore */ }
  }

  const handleDeleteEntry = async (entryId: string) => {
    // Optimistically remove from UI (cascade children too)
    setEntries((prev) => prev.filter((e) => e.id !== entryId && e.parent_entry_id !== entryId))
    try {
      await fetch(`/api/plan/entries/${entryId}`, {
        method: 'DELETE',
      })
    } catch { /* ignore */ }
  }

  function handleMealTap(entryId: string) {
    if (!isSwapMode) return
    if (selectedEntryId === null) {
      setSelectedEntryId(entryId)
    } else if (selectedEntryId === entryId) {
      setSelectedEntryId(null)
    } else {
      void performSwap(selectedEntryId, entryId)
    }
  }

  async function performSwap(idA: string, idB: string) {
    setIsSwapMode(false)
    setSelectedEntryId(null)
    setSwapError(null)

    const prev = [...entries]

    // Optimistic update — swap planned_dates for both main entries and their side dishes
    setEntries((curr) => {
      const dateA = curr.find((x) => x.id === idA)?.planned_date
      const dateB = curr.find((x) => x.id === idB)?.planned_date
      return curr.map((e) => {
        if (e.id === idA || e.parent_entry_id === idA) return dateB ? { ...e, planned_date: dateB } : e
        if (e.id === idB || e.parent_entry_id === idB) return dateA ? { ...e, planned_date: dateA } : e
        return e
      })
    })

    try {
      const res = await fetch('/api/plan/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_id_a: idA, entry_id_b: idB }),
      })
      if (!res.ok) throw new Error('Swap failed')
      setSwapToast({ entryIdA: idA, entryIdB: idB })
    } catch {
      setEntries(prev)
      setSwapError('Swap failed. Please try again.')
    }
  }

  const weekDates = getWeekDates(weekStart)

  return (
    <div className="space-y-3">
      {/* Week navigation header */}
      <div className="bg-sage-900 rounded-lg flex items-center justify-between px-3 py-2">
        <button
          onClick={handlePrevWeek}
          aria-label="Previous week"
          className="p-1.5 text-[#8CB89A] hover:text-sage-100 transition-colors"
        >
          ←
        </button>
        <span className="font-display text-sm font-medium text-sage-100">
          {formatWeekRange(weekStart)}
        </span>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <Link
              href={`/groceries?date_from=${weekStart}&date_to=${addDays(weekStart, 6)}`}
              className="flex items-center gap-1.5 text-sm font-medium text-[#8CB89A] hover:text-sage-100 transition-colors"
            >
              <ShoppingCart size={14} />
              Grocery list
            </Link>
          )}
          <button
            onClick={handleNextWeek}
            disabled={isAtMaxFuture}
            aria-label="Next week"
            className="p-1.5 text-[#8CB89A] hover:text-sage-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            →
          </button>
        </div>
      </div>

      {/* Swap meals control row */}
      {entries.filter((e) => !e.is_side_dish).length >= 2 && (
        <div className="flex justify-end">
          {!isSwapMode ? (
            <button
              onClick={() => setIsSwapMode(true)}
              className="font-display text-sm font-semibold text-sage-600 hover:text-sage-800 border border-sage-300 rounded-lg px-3 py-1.5 hover:bg-sage-50 transition-colors"
            >
              Swap meals
            </button>
          ) : (
            <SwapModeBanner
              hasSelection={selectedEntryId !== null}
              onCancel={() => {
                setIsSwapMode(false)
                setSelectedEntryId(null)
              }}
            />
          )}
        </div>
      )}

      {swapError && (
        <p className="text-sm text-red-600">{swapError}</p>
      )}

      {loading && (
        <div className="space-y-2">
          {weekDates.map((d) => (
            <div key={d} className="h-14 bg-stone-100 rounded animate-pulse" />
          ))}
        </div>
      )}

      {!loading && weekDates.map((date) => (
        <DayCard
          key={date}
          date={date}
          entries={entries.filter((e) => e.planned_date === date)}
          isExpanded={expandedDates.has(date)}
          onToggle={() => handleToggle(date)}
          onAddEntry={handleAddEntry}
          onDeleteEntry={handleDeleteEntry}
          isSwapMode={isSwapMode}
          selectedEntryId={selectedEntryId}
          onMealTap={handleMealTap}
        />
      ))}

      {swapToast && (
        <SwapToast
          entryIdA={swapToast.entryIdA}
          entryIdB={swapToast.entryIdB}
          onUndo={(idA, idB) => { void performSwap(idA, idB) }}
          onDismiss={() => setSwapToast(null)}
        />
      )}
    </div>
  )
}
