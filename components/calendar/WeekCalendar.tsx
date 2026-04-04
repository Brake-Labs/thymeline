'use client'

import { useState, useEffect, useCallback } from 'react'
import DayCard from './DayCard'
import { getAccessToken } from '@/lib/supabase/browser'
import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { getMostRecentSunday, addWeeks, addDays, getWeekDates, formatWeekRange } from '@/lib/date-utils'
import type { PlanEntry, MealType } from '@/types'

export default function WeekCalendar() {
  const currentSunday = getMostRecentSunday()
  const [weekStart, setWeekStart] = useState(currentSunday)
  const [entries, setEntries] = useState<PlanEntry[]>([])
  const [expandedDates, setExpandedDates] = useState<Set<string>>(
    () => new Set(getWeekDates(currentSunday))
  )
  const [loading, setLoading] = useState(false)

  const maxWeekStart = addWeeks(currentSunday, 4)
  const isAtMaxFuture = weekStart >= maxWeekStart

  const fetchPlan = useCallback(async (ws: string) => {
    setLoading(true)
    try {
      const token = await getAccessToken()
      const res = await fetch(`/api/plan?week_start=${ws}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
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
  }, [weekStart, fetchPlan, currentSunday])

  const handlePrevWeek = () => setWeekStart((ws) => addWeeks(ws, -1))
  const handleNextWeek = () => {
    if (!isAtMaxFuture) setWeekStart((ws) => addWeeks(ws, 1))
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
            const token = await getAccessToken()
            await fetch(`/api/plan/entries/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            })
          } catch { /* ignore */ }
        }
        setEntries((prev) => prev.filter((e) => !toDelete.includes(e.id)))
      }
    }

    try {
      const token = await getAccessToken()
      const res = await fetch('/api/plan/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      const token = await getAccessToken()
      await fetch(`/api/plan/entries/${entryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch { /* ignore */ }
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
        />
      ))}
    </div>
  )
}
