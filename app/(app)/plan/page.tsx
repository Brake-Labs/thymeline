'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import SetupStep from '@/components/plan/SetupStep'
import SuggestionsStep from '@/components/plan/SuggestionsStep'
import SummaryStep from '@/components/plan/SummaryStep'
import PostSaveModal from '@/components/plan/PostSaveModal'
import { getAccessToken } from '@/lib/supabase/browser'
import type { RecipeSuggestion, DaySelection, DaySuggestions, MealType, SavedPlanEntry, PlanSetup, SelectionsMap } from '@/types'
import type { MealTypeState } from '@/components/plan/SuggestionDayRow'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DayState {
  date:       string
  meal_types: MealTypeState[]
}

interface SuggestionsState {
  days: DayState[]
}

import { getMostRecentSunday, getWeekDates } from '@/lib/date-utils'

// ── Helpers ────────────────────────────────────────────────────────────────────

// ── Inner page (needs Suspense for useSearchParams) ────────────────────────────

function PlanPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const step = searchParams.get('step') ?? 'setup'

  const initialSunday = getMostRecentSunday()

  const [setup, setSetup] = useState<PlanSetup>({
    weekStart:       initialSunday,
    activeDates:     getWeekDates(initialSunday),
    activeMealTypes: ['dinner'],
    preferThisWeek:  [],
    avoidThisWeek:   [],
    freeText:        '',
  })
  const [suggestions, setSuggestions] = useState<SuggestionsState | null>(null)
  const [selections, setSelections] = useState<SelectionsMap>({})
  const [dessertSelections, setDessertSelections] = useState<Record<string, { recipe_id: string; recipe_title: string }>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedWeekStart, setSavedWeekStart] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)

  // Reset active dates when week changes
  useEffect(() => {
    setSetup((prev) => ({
      ...prev,
      activeDates: getWeekDates(prev.weekStart),
    }))
  }, [setup.weekStart])

  // Guard direct navigation to suggestions/summary without state
  useEffect(() => {
    if (step === 'suggestions' && !suggestions) {
      router.replace('/plan?step=setup')
    }
    if (step === 'summary') {
      const hasSelections = Object.values(selections).some((v) => v !== undefined && v !== null)
      if (!hasSelections) {
        router.replace('/plan?step=setup')
      }
    }
  }, [step, suggestions, selections, router])

  // ── Suggestion fetching ──────────────────────────────────────────────────────

  async function fetchSuggestions(activeDates: string[], mergeWithPrev = false) {
    setIsGenerating(true)
    setGenerateError(null)
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/plan/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          week_start:        setup.weekStart,
          active_dates:      activeDates,
          active_meal_types: setup.activeMealTypes,
          prefer_this_week:  setup.preferThisWeek,
          avoid_this_week:   setup.avoidThisWeek,
          free_text:         setup.freeText,
        }),
      })

      const days: DayState[] = activeDates.map((d) => ({
        date: d,
        meal_types: setup.activeMealTypes.map((mt) => ({ meal_type: mt, options: [], isSwapping: false })),
      }))

      const applyDays = (incoming: DayState[]) => {
        if (mergeWithPrev) {
          setSuggestions((prev) => prev ? {
            days: prev.days.map((day) => {
              const updated = incoming.find((d) => d.date === day.date)
              return updated ?? day
            }),
          } : { days: incoming })
        } else {
          setSuggestions({ days: incoming })
        }
      }

      if (res.ok) {
        const data = await res.json() as { days: DaySuggestions[] }
        for (const dayData of data.days ?? []) {
          const idx = days.findIndex((d) => d.date === dayData.date)
          if (idx >= 0 && days[idx]) {
            days[idx].meal_types = (dayData.meal_types ?? []).map((mts) => ({
              meal_type:  mts.meal_type,
              options:    mts.options,
              isSwapping: false,
            }))
          }
        }
      } else {
        setGenerateError('Failed to generate suggestions. Please try again.')
      }

      applyDays(days)
      if (!mergeWithPrev) router.push('/plan?step=suggestions')
    } catch (err) {
      setGenerateError('Failed to generate suggestions. Please try again.')
      console.error(err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGetSuggestions = () => fetchSuggestions(setup.activeDates)

  // ── Swap ─────────────────────────────────────────────────────────────────────

  async function handleSwapSlot(date: string, mealType: MealType) {
    if (!suggestions) return
    setSuggestions((prev) => prev ? {
      days: prev.days.map((d) => d.date === date ? {
        ...d,
        meal_types: d.meal_types.map((mts) =>
          mts.meal_type === mealType ? { ...mts, isSwapping: true } : mts
        ),
      } : d),
    } : prev)

    try {
      const token = await getAccessToken()
      const alreadySelected = Object.entries(selections)
        .filter(([key, sel]) => !key.startsWith(`${date}:`) && sel !== null && sel !== undefined)
        .map(([, sel]) => ({ date: (sel as DaySelection).date, recipe_id: (sel as DaySelection).recipe_id }))

      const res = await fetch('/api/plan/suggest/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          date,
          meal_type:        mealType,
          week_start:       setup.weekStart,
          already_selected: alreadySelected,
          prefer_this_week: setup.preferThisWeek,
          avoid_this_week:  setup.avoidThisWeek,
          free_text:        setup.freeText,
        }),
      })
      if (res.ok) {
        const data = await res.json() as { date: string; meal_type: MealType; options: RecipeSuggestion[] }
        setSuggestions((prev) => prev ? {
          days: prev.days.map((d) => d.date === date ? {
            ...d,
            meal_types: d.meal_types.map((mts) =>
              mts.meal_type === mealType ? { ...mts, options: data.options, isSwapping: false } : mts
            ),
          } : d),
        } : prev)
      } else {
        setSuggestions((prev) => prev ? {
          days: prev.days.map((d) => d.date === date ? {
            ...d,
            meal_types: d.meal_types.map((mts) =>
              mts.meal_type === mealType ? { ...mts, isSwapping: false } : mts
            ),
          } : d),
        } : prev)
      }
    } catch {
      setSuggestions((prev) => prev ? {
        days: prev.days.map((d) => d.date === date ? {
          ...d,
          meal_types: d.meal_types.map((mts) =>
            mts.meal_type === mealType ? { ...mts, isSwapping: false } : mts
          ),
        } : d),
      } : prev)
    }
  }

  // ── Selections ────────────────────────────────────────────────────────────────

  const handleSelect = (date: string, mealType: MealType, recipe: RecipeSuggestion) => {
    const key = `${date}:${mealType}`
    setSelections((prev) => {
      if (prev[key]?.recipe_id === recipe.recipe_id) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return {
        ...prev,
        [key]: { date, meal_type: mealType, recipe_id: recipe.recipe_id, recipe_title: recipe.recipe_title, from_vault: false },
      }
    })
  }

  const handleSkipSlot = (date: string, mealType: MealType) => {
    const key = `${date}:${mealType}`
    setSelections((prev) => {
      const current = prev[key]
      if (current === null) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: null }
    })
  }

  const handleAssignToDay = (recipe: RecipeSuggestion, sourceDate: string, targetDate: string, mealType: MealType) => {
    // Remove from source day, add to target day options
    setSuggestions((prev) => {
      if (!prev) return prev
      return {
        days: prev.days.map((day) => {
          if (day.date === sourceDate) {
            return {
              ...day,
              meal_types: day.meal_types.map((mts) =>
                mts.meal_type === mealType
                  ? { ...mts, options: mts.options.filter((o) => o.recipe_id !== recipe.recipe_id) }
                  : mts
              ),
            }
          }
          if (day.date === targetDate) {
            return {
              ...day,
              meal_types: day.meal_types.map((mts) =>
                mts.meal_type === mealType
                  ? {
                      ...mts,
                      options: mts.options.some((o) => o.recipe_id === recipe.recipe_id)
                        ? mts.options
                        : [...mts.options, recipe],
                    }
                  : mts
              ),
            }
          }
          return day
        }),
      }
    })
    // Set as target day's selection (replaces any previous)
    const key = `${targetDate}:${mealType}`
    setSelections((prev) => ({
      ...prev,
      [key]: { date: targetDate, meal_type: mealType, recipe_id: recipe.recipe_id, recipe_title: recipe.recipe_title, from_vault: false },
    }))
  }

  const handleVaultPick = (date: string, mealType: MealType, recipe: { recipe_id: string; recipe_title: string }) => {
    const key = `${date}:${mealType}`
    setSelections((prev) => ({
      ...prev,
      [key]: { date, meal_type: mealType, recipe_id: recipe.recipe_id, recipe_title: recipe.recipe_title, from_vault: true },
    }))
  }

  // ── Free-text match ───────────────────────────────────────────────────────────

  async function handleFreeTextMatch(query: string, date: string, mealType: MealType): Promise<{ matched: boolean }> {
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/plan/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, date, meal_type: mealType }),
      })
      if (!res.ok) return { matched: false }
      const data = await res.json() as { matches: { recipe_id: string; recipe_title: string }[] }
      if (!data.matches?.length) return { matched: false }
      // Inject the top matches into the slot's options list (prepend, deduplicate by recipe_id)
      setSuggestions((prev) => {
        if (!prev) return prev
        return {
          days: prev.days.map((d) => d.date !== date ? d : {
            ...d,
            meal_types: d.meal_types.map((mts) => {
              if (mts.meal_type !== mealType) return mts
              const existingIds = new Set(mts.options.map((o) => o.recipe_id))
              const newOptions = data.matches.filter((m) => !existingIds.has(m.recipe_id))
              return { ...mts, options: [...newOptions, ...mts.options] }
            }),
          }),
        }
      })
      return { matched: true }
    } catch {
      return { matched: false }
    }
  }

  // ── Dessert picks ─────────────────────────────────────────────────────────────

  const handleDessertPick = (date: string, mealType: MealType, recipe: { recipe_id: string; recipe_title: string }) => {
    setDessertSelections((prev) => ({ ...prev, [`${date}:${mealType}`]: recipe }))
  }

  const handleDessertRemove = (date: string, mealType: MealType) => {
    setDessertSelections((prev) => {
      const next = { ...prev }
      delete next[`${date}:${mealType}`]
      return next
    })
  }

  // ── Regenerate ────────────────────────────────────────────────────────────────

  const handleRegenerate = (onlyUnselected?: boolean) => {
    if (!onlyUnselected) {
      setSelections({})
      setDessertSelections({})
      fetchSuggestions(setup.activeDates)
    } else {
      const unselectedDates = setup.activeDates.filter((d) =>
        setup.activeMealTypes.every((mt) => selections[`${d}:${mt}`] === undefined)
      )
      fetchSuggestions(unselectedDates.length > 0 ? unselectedDates : setup.activeDates, true)
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setIsSaving(true)
    try {
      const entries = Object.entries(selections)
        .filter(([, sel]) => sel !== null && sel !== undefined)
        .map(([, sel]) => {
          const s = sel as DaySelection
          return {
            date:      s.date,
            recipe_id: s.recipe_id,
            meal_type: s.meal_type,
          }
        })

      const token = await getAccessToken()
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ week_start: setup.weekStart, entries }),
      })

      if (!res.ok) {
        let msg = 'Save failed'
        try { const body = await res.json(); if (body.error) msg = body.error } catch { /* ignore */ }
        throw new Error(msg)
      }

      const savedData = await res.json() as { plan_id: string; entries: SavedPlanEntry[] }

      // Save desserts: match each dessert to its parent entry by date + meal_type
      for (const [key, dessert] of Object.entries(dessertSelections)) {
        const colonIdx = key.indexOf(':')
        const date = key.slice(0, colonIdx)
        const parentMealType = key.slice(colonIdx + 1) as MealType
        const parent = savedData.entries.find(
          (e) => e.planned_date === date && e.meal_type === parentMealType && !e.is_side_dish
        )
        if (!parent) continue
        await fetch('/api/plan/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            week_start:      setup.weekStart,
            date,
            recipe_id:       dessert.recipe_id,
            meal_type:       'dessert',
            is_side_dish:    true,
            parent_entry_id: parent.id,
          }),
        })
      }

      setSavedWeekStart(setup.weekStart)
      router.push('/plan?step=summary')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-8 md:px-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-2xl font-bold text-stone-900 mb-6">Help Me Plan</h1>

        {generateError && (
          <p className="text-red-500 text-sm mt-2">{generateError}</p>
        )}

        {step === 'setup' && (
          <SetupStep
            setup={setup}
            onSetupChange={(updates) => setSetup((prev) => ({ ...prev, ...updates }))}
            onGetSuggestions={handleGetSuggestions}
            isGenerating={isGenerating}
          />
        )}

        {step === 'suggestions' && suggestions && (
          <SuggestionsStep
            setup={setup}
            suggestions={suggestions}
            selections={selections}
            onSelect={handleSelect}
            onSkipSlot={handleSkipSlot}
            onSwapSlot={handleSwapSlot}
            onAssignToDay={handleAssignToDay}
            onVaultPick={handleVaultPick}
            onFreeTextMatch={handleFreeTextMatch}
            onDessertPick={handleDessertPick}
            onDessertRemove={handleDessertRemove}
            onRegenerate={handleRegenerate}
            onConfirm={() => router.push('/plan?step=summary')}
            onBack={() => router.push('/plan?step=setup')}
          />
        )}

        {step === 'summary' && (
          <SummaryStep
            setup={setup}
            selections={selections}
            onSave={handleSave}
            isSaving={isSaving}
            onBack={() => router.push('/plan?step=suggestions')}
          />
        )}
      </div>

      {savedWeekStart && (
        <PostSaveModal weekStart={savedWeekStart} isOpen={true} />
      )}
    </div>
  )
}

export default function PlanPage() {
  return (
    <Suspense>
      <PlanPageInner />
    </Suspense>
  )
}
