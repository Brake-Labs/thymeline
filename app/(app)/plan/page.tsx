'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import SetupStep from '@/components/plan/SetupStep'
import SuggestionsStep from '@/components/plan/SuggestionsStep'
import SummaryStep from '@/components/plan/SummaryStep'
import PostSaveModal from '@/components/plan/PostSaveModal'
import { getAccessToken } from '@/lib/supabase/browser'
import type { RecipeSuggestion, DaySelection, DaySuggestions } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlanSetup {
  weekStart:        string
  activeDates:      string[]
  preferThisWeek:   string[]
  avoidThisWeek:    string[]
  freeText:         string
  specificRequests: string
}

interface DayState {
  date:       string
  options:    RecipeSuggestion[]
  isSwapping: boolean
}

interface SuggestionsState {
  days: DayState[]
}

type SelectionsMap = Record<string, DaySelection | null>

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMostRecentSunday(): string {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  // Use local date parts — toISOString() converts to UTC which can shift the date
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDefaultActiveDates(weekStart: string): string[] {
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T12:00:00Z')
    d.setDate(d.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

// ── Inner page (needs Suspense for useSearchParams) ────────────────────────────

function PlanPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const step = searchParams.get('step') ?? 'setup'

  const initialSunday = getMostRecentSunday()

  const [setup, setSetup] = useState<PlanSetup>({
    weekStart:        initialSunday,
    activeDates:      getDefaultActiveDates(initialSunday),
    preferThisWeek:   [],
    avoidThisWeek:    [],
    freeText:         '',
    specificRequests: '',
  })
  const [suggestions, setSuggestions] = useState<SuggestionsState | null>(null)
  const [selections, setSelections] = useState<SelectionsMap>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedWeekStart, setSavedWeekStart] = useState<string | null>(null)

  // Reset active dates when week changes
  useEffect(() => {
    setSetup((prev) => ({
      ...prev,
      activeDates: getDefaultActiveDates(prev.weekStart),
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
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/plan/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          week_start:        setup.weekStart,
          active_dates:      activeDates,
          prefer_this_week:  setup.preferThisWeek,
          avoid_this_week:   setup.avoidThisWeek,
          free_text:         setup.freeText,
          specific_requests: setup.specificRequests,
        }),
      })

      const contentType = res.headers.get('content-type') ?? ''
      const days: DayState[] = activeDates.map((d) => ({ date: d, options: [], isSwapping: false }))

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

      if (contentType.includes('application/x-ndjson')) {
        // Streaming path
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
              if (!line.trim()) continue
              try {
                const dayData = JSON.parse(line) as DaySuggestions
                const idx = days.findIndex((d) => d.date === dayData.date)
                if (idx >= 0) days[idx].options = dayData.options
                applyDays([...days])
              } catch { /* skip malformed line */ }
            }
          }
        }
      } else {
        // JSON fallback
        const data = await res.json() as { days: DaySuggestions[] }
        for (const dayData of data.days ?? []) {
          const idx = days.findIndex((d) => d.date === dayData.date)
          if (idx >= 0) days[idx].options = dayData.options
        }
      }

      applyDays(days)
      if (!mergeWithPrev) router.push('/plan?step=suggestions')
    } catch (err) {
      console.error('Suggest error:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGetSuggestions = () => fetchSuggestions(setup.activeDates)

  // ── Swap ─────────────────────────────────────────────────────────────────────

  async function handleSwapDay(date: string) {
    if (!suggestions) return
    setSuggestions((prev) => prev ? {
      days: prev.days.map((d) => d.date === date ? { ...d, isSwapping: true } : d),
    } : prev)

    try {
      const token = await getAccessToken()
      const alreadySelected = Object.entries(selections)
        .filter(([d, sel]) => d !== date && sel !== null && sel !== undefined)
        .map(([d, sel]) => ({ date: d, recipe_id: (sel as DaySelection).recipe_id }))

      const res = await fetch('/api/plan/suggest/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          date,
          week_start:       setup.weekStart,
          already_selected: alreadySelected,
          prefer_this_week: setup.preferThisWeek,
          avoid_this_week:  setup.avoidThisWeek,
          free_text:        setup.freeText,
        }),
      })
      if (res.ok) {
        const data = await res.json() as { date: string; options: RecipeSuggestion[] }
        setSuggestions((prev) => prev ? {
          days: prev.days.map((d) =>
            d.date === date ? { ...d, options: data.options, isSwapping: false } : d
          ),
        } : prev)
      } else {
        setSuggestions((prev) => prev ? {
          days: prev.days.map((d) => d.date === date ? { ...d, isSwapping: false } : d),
        } : prev)
      }
    } catch {
      setSuggestions((prev) => prev ? {
        days: prev.days.map((d) => d.date === date ? { ...d, isSwapping: false } : d),
      } : prev)
    }
  }

  // ── Selections ────────────────────────────────────────────────────────────────

  const handleSelect = (date: string, recipe: RecipeSuggestion) => {
    setSelections((prev) => ({
      ...prev,
      [date]: { date, recipe_id: recipe.recipe_id, recipe_title: recipe.recipe_title, from_vault: false },
    }))
  }

  const handleSkipDay = (date: string) => {
    setSelections((prev) => {
      const current = prev[date]
      // Undo skip: remove the key entirely (back to unselected)
      if (current === null) {
        const next = { ...prev }
        delete next[date]
        return next
      }
      return { ...prev, [date]: null }
    })
  }

  const handleAssignToDay = (recipe: RecipeSuggestion, targetDate: string) => {
    setSelections((prev) => ({
      ...prev,
      [targetDate]: { date: targetDate, recipe_id: recipe.recipe_id, recipe_title: recipe.recipe_title, from_vault: false },
    }))
  }

  const handleVaultPick = (_date: string, recipe: DaySelection) => {
    setSelections((prev) => ({ ...prev, [recipe.date]: recipe }))
  }

  // ── Free-text match ───────────────────────────────────────────────────────────

  async function handleFreeTextMatch(query: string, date: string): Promise<{ matched: boolean }> {
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/plan/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, date }),
      })
      if (!res.ok) return { matched: false }
      const data = await res.json() as { match: { recipe_id: string; recipe_title: string } | null }
      if (!data.match) return { matched: false }
      setSelections((prev) => ({
        ...prev,
        [date]: { date, recipe_id: data.match!.recipe_id, recipe_title: data.match!.recipe_title, from_vault: true },
      }))
      return { matched: true }
    } catch {
      return { matched: false }
    }
  }

  // ── Regenerate ────────────────────────────────────────────────────────────────

  const handleRegenerate = (onlyUnselected?: boolean) => {
    if (!onlyUnselected) {
      setSelections({})
      fetchSuggestions(setup.activeDates)
    } else {
      const unselectedDates = setup.activeDates.filter(
        (d) => selections[d] === undefined,
      )
      fetchSuggestions(unselectedDates.length > 0 ? unselectedDates : setup.activeDates, true)
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setIsSaving(true)
    const entries = Object.entries(selections)
      .filter(([, sel]) => sel !== null && sel !== undefined)
      .map(([, sel]) => ({ date: (sel as DaySelection).date, recipe_id: (sel as DaySelection).recipe_id }))

    const token = await getAccessToken()
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ week_start: setup.weekStart, entries }),
    })
    setIsSaving(false)

    if (!res.ok) throw new Error('Save failed')
    setSavedWeekStart(setup.weekStart)
    router.push('/plan?step=summary')
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-8 md:px-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-stone-900 mb-6">Help Me Plan</h1>

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
            onSkipDay={handleSkipDay}
            onSwapDay={handleSwapDay}
            onAssignToDay={handleAssignToDay}
            onVaultPick={handleVaultPick}
            onFreeTextMatch={handleFreeTextMatch}
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
