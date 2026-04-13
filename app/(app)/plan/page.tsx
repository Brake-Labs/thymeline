'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ContextScreen from '@/components/plan/ContextScreen'
import SuggestionsScreen from '@/components/plan/SuggestionsScreen'
import type { RecipeSuggestion, DaySelection, DaySuggestions, MealType, SavedPlanEntry, PlanSetup, SelectionsMap } from '@/types'
import type { MealTypeState } from '@/components/plan/DayCard'

import { getMostRecentSunday, getMostRecentWeekStart, getWeekDates, addDays } from '@/lib/date-utils'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DayState {
  date:        string
  mealTypes:   MealTypeState[]
  whyThisDay?: string
}

interface SuggestionsState {
  days: DayState[]
}

import { DAY_NAMES } from '@/lib/date-utils'

// ── Inner page (needs Suspense for useSearchParams) ────────────────────────────

function PlanPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const step = searchParams.get('step') ?? 'context'
  const weekStartParam = searchParams.get('weekStart')

  const initialWeekStart = weekStartParam ?? getMostRecentSunday()

  const [weekStartDay, setWeekStartDay] = useState(0)
  const [setup, setSetup] = useState<PlanSetup>({
    weekStart:       initialWeekStart,
    activeDates:     getWeekDates(initialWeekStart),
    activeMealTypes: ['dinner'],
    preferThisWeek:  [],
    avoidThisWeek:   [],
    freeText:        '',
  })
  const [suggestions, setSuggestions] = useState<SuggestionsState | null>(null)
  const [selections, setSelections] = useState<SelectionsMap>({})
  const [sideDishSelections, setSideDishSelections] = useState<Record<string, { recipeId: string; recipeTitle: string }>>({})
  const [dessertSelections, setDessertSelections] = useState<Record<string, { recipeId: string; recipeTitle: string }>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [existingPlanForWeek, setExistingPlanForWeek] = useState(false)
  const isInitialLoad = useRef(true)

  // Load weekStartDay preference and lastActiveDays/lastActiveMealTypes on mount
  useEffect(() => {
    async function loadPref() {
      try {
        const res = await fetch('/api/preferences')
        if (res.ok) {
          const prefs = await res.json()
          const raw = prefs.weekStartDay ?? 'sunday'
          const pref: number = raw === 'monday' ? 1 : typeof raw === 'number' ? raw : 0
          setWeekStartDay(pref)

          let start = initialWeekStart
          if (pref !== 0 && !weekStartParam) {
            start = getMostRecentWeekStart(pref)
          }

          // Pre-populate from saved lastActiveDays and lastActiveMealTypes
          const savedDays: string[] = prefs.lastActiveDays ?? []
          const savedMealTypes: MealType[] = prefs.lastActiveMealTypes ?? []

          let activeDates = getWeekDates(start)
          if (savedDays.length > 0) {
            // Convert day names to dates for the given week
            const allDates = getWeekDates(start)
            activeDates = allDates.filter((d) => {
              const dayOfWeek = new Date(d + 'T12:00:00Z').getUTCDay()
              const dayName = DAY_NAMES[dayOfWeek] ?? 'sunday'
              return savedDays.includes(dayName)
            })
            // Ensure at least 1 day
            if (activeDates.length === 0) activeDates = allDates
          }

          setSetup((prev) => ({
            ...prev,
            weekStart: start,
            activeDates,
            activeMealTypes: savedMealTypes.length > 0 ? savedMealTypes : prev.activeMealTypes,
          }))
        }
      } catch { /* silently fail — default to Sunday */ }
    }
    void loadPref()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset active dates when week changes (skip initial load to preserve lastActiveDays)
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false
      return
    }
    setSetup((prev) => ({
      ...prev,
      activeDates: getWeekDates(prev.weekStart),
    }))
  }, [setup.weekStart])

  // Check if existing plan exists for this week
  useEffect(() => {
    async function checkPlan() {
      try {
        const res = await fetch(`/api/plan?weekStart=${setup.weekStart}`)
        if (res.ok) {
          const data = await res.json()
          setExistingPlanForWeek(!!data.plan)
        }
      } catch { /* ignore */ }
    }
    checkPlan()
  }, [setup.weekStart])

  // Guard direct navigation to suggestions without state
  useEffect(() => {
    if (step === 'suggestions' && !suggestions) {
      router.replace('/plan?step=context')
    }
  }, [step, suggestions, router])

  // ── Suggestion fetching ──────────────────────────────────────────────────────

  async function fetchSuggestions(activeDates: string[], mergeWithPrev = false) {
    setIsGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch('/api/plan/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart:        setup.weekStart,
          activeDates:      activeDates,
          activeMealTypes: setup.activeMealTypes,
          preferThisWeek:  setup.preferThisWeek,
          avoidThisWeek:   setup.avoidThisWeek,
          freeText:         setup.freeText,
        }),
      })

      const days: DayState[] = activeDates.map((d) => ({
        date: d,
        mealTypes: setup.activeMealTypes.map((mt) => ({ mealType: mt, options: [], isSwapping: false })),
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
            days[idx].mealTypes = (dayData.mealTypes ?? []).map((mts) => ({
              mealType:  mts.mealType,
              options:    mts.options,
              isSwapping: false,
            }))
            days[idx].whyThisDay = dayData.whyThisDay
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
        mealTypes: d.mealTypes.map((mts) =>
          mts.mealType === mealType ? { ...mts, isSwapping: true } : mts
        ),
      } : d),
    } : prev)

    try {
      const alreadySelected = Object.entries(selections)
        .filter(([key, sel]) => !key.startsWith(`${date}:`) && sel !== null && sel !== undefined)
        .map(([, sel]) => ({ date: (sel as DaySelection).date, recipeId: (sel as DaySelection).recipeId }))

      const res = await fetch('/api/plan/suggest/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          mealType:        mealType,
          weekStart:       setup.weekStart,
          alreadySelected: alreadySelected,
          preferThisWeek: setup.preferThisWeek,
          avoidThisWeek:  setup.avoidThisWeek,
          freeText:        setup.freeText,
        }),
      })
      if (res.ok) {
        const data = await res.json() as { date: string; mealType: MealType; options: RecipeSuggestion[]; whyThisSwap?: string }
        setSuggestions((prev) => prev ? {
          days: prev.days.map((d) => d.date === date ? {
            ...d,
            whyThisDay: data.whyThisSwap ?? d.whyThisDay,
            mealTypes: d.mealTypes.map((mts) =>
              mts.mealType === mealType ? { ...mts, options: data.options, isSwapping: false } : mts
            ),
          } : d),
        } : prev)
      } else {
        setSuggestions((prev) => prev ? {
          days: prev.days.map((d) => d.date === date ? {
            ...d,
            mealTypes: d.mealTypes.map((mts) =>
              mts.mealType === mealType ? { ...mts, isSwapping: false } : mts
            ),
          } : d),
        } : prev)
      }
    } catch {
      setSuggestions((prev) => prev ? {
        days: prev.days.map((d) => d.date === date ? {
          ...d,
          mealTypes: d.mealTypes.map((mts) =>
            mts.mealType === mealType ? { ...mts, isSwapping: false } : mts
          ),
        } : d),
      } : prev)
    }
  }

  // ── Selections ────────────────────────────────────────────────────────────────

  const handleSelect = (date: string, mealType: MealType, recipe: RecipeSuggestion) => {
    const key = `${date}:${mealType}`
    setSelections((prev) => {
      if (prev[key]?.recipeId === recipe.recipeId) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return {
        ...prev,
        [key]: { date, mealType: mealType, recipeId: recipe.recipeId, recipeTitle: recipe.recipeTitle, fromVault: false },
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
    setSuggestions((prev) => {
      if (!prev) return prev
      return {
        days: prev.days.map((day) => {
          if (day.date === sourceDate) {
            return {
              ...day,
              mealTypes: day.mealTypes.map((mts) =>
                mts.mealType === mealType
                  ? { ...mts, options: mts.options.filter((o) => o.recipeId !== recipe.recipeId) }
                  : mts
              ),
            }
          }
          if (day.date === targetDate) {
            return {
              ...day,
              mealTypes: day.mealTypes.map((mts) =>
                mts.mealType === mealType
                  ? {
                      ...mts,
                      options: mts.options.some((o) => o.recipeId === recipe.recipeId)
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
    const key = `${targetDate}:${mealType}`
    setSelections((prev) => ({
      ...prev,
      [key]: { date: targetDate, mealType: mealType, recipeId: recipe.recipeId, recipeTitle: recipe.recipeTitle, fromVault: false },
    }))
  }

  const handleVaultPick = (date: string, mealType: MealType, recipe: { recipeId: string; recipeTitle: string }) => {
    const key = `${date}:${mealType}`
    setSelections((prev) => ({
      ...prev,
      [key]: { date, mealType: mealType, recipeId: recipe.recipeId, recipeTitle: recipe.recipeTitle, fromVault: true },
    }))
  }

  // ── Free-text match ───────────────────────────────────────────────────────────

  async function handleFreeTextMatch(query: string, date: string, mealType: MealType): Promise<{ matched: boolean }> {
    try {
      const res = await fetch('/api/plan/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, date, mealType: mealType }),
      })
      if (!res.ok) return { matched: false }
      const data = await res.json() as { matches: { recipeId: string; recipeTitle: string }[] }
      if (!data.matches?.length) return { matched: false }
      setSuggestions((prev) => {
        if (!prev) return prev
        return {
          days: prev.days.map((d) => d.date !== date ? d : {
            ...d,
            mealTypes: d.mealTypes.map((mts) => {
              if (mts.mealType !== mealType) return mts
              const existingIds = new Set(mts.options.map((o) => o.recipeId))
              const newOptions = data.matches.filter((m) => !existingIds.has(m.recipeId))
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

  // ── Side dish picks ───────────────────────────────────────────────────────────

  const handleSideDishPick = (date: string, mealType: MealType, recipe: { recipeId: string; recipeTitle: string }) => {
    setSideDishSelections((prev) => ({ ...prev, [`${date}:${mealType}`]: recipe }))
  }

  const handleSideDishRemove = (date: string, mealType: MealType) => {
    setSideDishSelections((prev) => {
      const next = { ...prev }
      delete next[`${date}:${mealType}`]
      return next
    })
  }

  // ── Dessert picks ─────────────────────────────────────────────────────────────

  const handleDessertPick = (date: string, mealType: MealType, recipe: { recipeId: string; recipeTitle: string }) => {
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
      setSideDishSelections({})
      setDessertSelections({})
      fetchSuggestions(setup.activeDates)
    } else {
      const unselectedDates = setup.activeDates.filter((d) =>
        setup.activeMealTypes.every((mt) => selections[`${d}:${mt}`] === undefined)
      )
      fetchSuggestions(unselectedDates.length > 0 ? unselectedDates : setup.activeDates, true)
    }
  }

  // ── Save helpers ──────────────────────────────────────────────────────────────

  async function savePlan(): Promise<{ planId: string; entries: SavedPlanEntry[] }> {
    const entries = Object.entries(selections)
      .filter(([, sel]) => sel !== null && sel !== undefined)
      .map(([, sel]) => {
        const s = sel as DaySelection
        return {
          date:      s.date,
          recipeId: s.recipeId,
          mealType: s.mealType,
        }
      })

    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekStart: setup.weekStart, entries }),
    })

    if (!res.ok) {
      let msg = 'Save failed'
      try { const body = await res.json(); if (body.error) msg = body.error } catch { /* ignore */ }
      throw new Error(msg)
    }

    const savedData = await res.json() as { planId: string; entries: SavedPlanEntry[] }

    // Save side dishes
    for (const [key, sideDish] of Object.entries(sideDishSelections)) {
      const colonIdx = key.indexOf(':')
      const entryDate = key.slice(0, colonIdx)
      const parentMealType = key.slice(colonIdx + 1) as MealType
      const parent = savedData.entries.find(
        (e) => e.plannedDate === entryDate && e.mealType === parentMealType && !e.isSideDish
      )
      if (!parent) continue
      await fetch('/api/plan/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart:      setup.weekStart,
          date:            entryDate,
          recipeId:       sideDish.recipeId,
          mealType:       parentMealType,
          isSideDish:    true,
          parentEntryId: parent.id,
        }),
      })
    }

    // Save desserts
    for (const [key, dessert] of Object.entries(dessertSelections)) {
      const colonIdx = key.indexOf(':')
      const entryDate = key.slice(0, colonIdx)
      const parentMealType = key.slice(colonIdx + 1) as MealType
      const parent = savedData.entries.find(
        (e) => e.plannedDate === entryDate && e.mealType === parentMealType && !e.isSideDish
      )
      if (!parent) continue
      await fetch('/api/plan/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStart:      setup.weekStart,
          date:            entryDate,
          recipeId:       dessert.recipeId,
          mealType:       'dessert',
          isSideDish:    true,
          parentEntryId: parent.id,
        }),
      })
    }

    return savedData
  }

  // ── Save & Build Grocery List ─────────────────────────────────────────────────

  async function handleSaveAndGrocery() {
    setIsSaving(true)
    try {
      await savePlan()

      // Try to generate grocery list
      try {
        const groceryRes = await fetch('/api/groceries/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekStart: setup.weekStart,
            dateFrom:  setup.weekStart,
            dateTo:    addDays(setup.weekStart, 6),
          }),
        })

        if (groceryRes.ok) {
          router.push(`/groceries?dateFrom=${setup.weekStart}&dateTo=${addDays(setup.weekStart, 6)}`)
        } else {
          // Partial failure: plan saved, grocery failed
          router.push(`/groceries?weekStart=${setup.weekStart}&status=pending`)
        }
      } catch {
        // Partial failure: plan saved, grocery failed
        router.push(`/groceries?weekStart=${setup.weekStart}&status=pending`)
      }
    } finally {
      setIsSaving(false)
    }
  }

  // ── Save Plan Only ────────────────────────────────────────────────────────────

  async function handleSaveOnly() {
    setIsSaving(true)
    try {
      await savePlan()
      router.push('/home')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-8 md:px-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="font-display text-2xl font-bold text-stone-900 mb-6">Help Me Plan</h1>

        {generateError && (
          <p className="text-red-500 text-sm mt-2">{generateError}</p>
        )}

        {(step === 'context' || step === 'setup') && (
          <ContextScreen
            setup={setup}
            weekStartDay={weekStartDay}
            onSetupChange={(updates) => setSetup((prev) => ({ ...prev, ...updates }))}
            onGenerate={handleGetSuggestions}
            isGenerating={isGenerating}
            existingPlanForWeek={existingPlanForWeek}
          />
        )}

        {step === 'suggestions' && suggestions && (
          <SuggestionsScreen
            setup={setup}
            suggestions={suggestions}
            selections={selections}
            onSelect={handleSelect}
            onSkipSlot={handleSkipSlot}
            onSwapSlot={handleSwapSlot}
            onAssignToDay={handleAssignToDay}
            onVaultPick={handleVaultPick}
            onFreeTextMatch={handleFreeTextMatch}
            onSideDishPick={handleSideDishPick}
            onSideDishRemove={handleSideDishRemove}
            onDessertPick={handleDessertPick}
            onDessertRemove={handleDessertRemove}
            onRegenerate={handleRegenerate}
            onSaveAndGrocery={handleSaveAndGrocery}
            onSaveOnly={handleSaveOnly}
            isSaving={isSaving}
            onBack={() => router.push('/plan?step=context')}
          />
        )}
      </div>
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
