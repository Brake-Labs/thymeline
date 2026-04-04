'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ActiveTimersBar from '@/components/cook/ActiveTimersBar'
import StepTimer, { type TimerState } from '@/components/cook/StepTimer'
import { renderHighlighted } from '@/components/cook/renderHighlighted'
import { injectStepQuantities } from '@/lib/inject-step-quantities'
import { getAccessToken } from '@/lib/supabase/browser'
import { getMostRecentSunday, getTodayISO } from '@/lib/date-utils'
import { TOAST_DURATION_LONG_MS } from '@/lib/constants'
import type { MealType, Recipe } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecipeDetail {
  id: string
  title: string
  steps: string[]
  ingredients: string
  servings: number
  total_time_minutes: number | null
}

interface CombinedStep {
  text: string
  recipeId: string
  recipeTitle: string
  ingredients: string
  baseServings: number
  /** 0-based index within the recipe's own step list */
  recipeStepIndex: number
  /** Total number of steps in this recipe */
  recipeTotalSteps: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCombinedSteps(recipes: RecipeDetail[]): CombinedStep[] {
  // Sort longest-cooking recipe first so the user starts it early
  const sorted = [...recipes].sort(
    (a, b) => (b.total_time_minutes ?? 0) - (a.total_time_minutes ?? 0),
  )
  const combined: CombinedStep[] = []
  for (const r of sorted) {
    r.steps.forEach((text, i) => {
      combined.push({
        text,
        recipeId:       r.id,
        recipeTitle:    r.title,
        ingredients:    r.ingredients,
        baseServings:   r.servings,
        recipeStepIndex: i,
        recipeTotalSteps: r.steps.length,
      })
    })
  }
  return combined
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
  params: { date: string }
}

export default function MultiRecipeCookPage({ params }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mealTypeParam = searchParams.get('meal_type') as MealType | null

  const [recipes, setRecipes] = useState<RecipeDetail[]>([])
  const [combinedSteps, setCombinedSteps] = useState<CombinedStep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selection screen: shown when > 1 recipe is available
  const [phase, setPhase] = useState<'select' | 'ordering' | 'cook'>('cook')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [orderError, setOrderError] = useState<string | null>(null)

  const [currentStep, setCurrentStep] = useState(0)
  const [timers, setTimers] = useState<Map<number, TimerState>>(new Map())
  const [logStatus, setLogStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [wakeLockActive, setWakeLockActive] = useState(false)

  const wakeLockRef  = useRef<WakeLockSentinel | null>(null)
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const chimedRef    = useRef<Set<number>>(new Set())

  // ── Data fetch ───────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const token = await getAccessToken()
        const headers = { Authorization: `Bearer ${token}` }

        // Compute the week_start that contains `params.date`
        const weekStart = getMostRecentSunday(new Date(params.date + 'T12:00:00Z'))

        // Fetch the plan for that week
        const planRes = await fetch(`/api/plan?week_start=${weekStart}`, { headers })
        if (!planRes.ok) { setError('Could not load meal plan.'); setLoading(false); return }
        const planData: { plan: { entries: { recipe_id: string; planned_date: string; meal_type: MealType; is_side_dish: boolean; parent_entry_id: string | null }[] } | null } = await planRes.json()

        if (!planData.plan) { setError('No meal plan for this date.'); setLoading(false); return }

        // Filter entries for this date (and optionally meal type)
        let entries = planData.plan.entries.filter((e) => e.planned_date === params.date)
        if (mealTypeParam) {
          entries = entries.filter((e) =>
            e.meal_type === mealTypeParam ||
            // Include side dishes whose parent belongs to this meal type
            (e.is_side_dish && entries.find((p) => p.recipe_id === e.parent_entry_id)?.meal_type === mealTypeParam),
          )
        }

        // Collect unique recipe IDs (skip desserts unless they're the only thing)
        const recipeIds = [...new Set(entries.map((e) => e.recipe_id))]
        if (recipeIds.length === 0) { setError('No recipes planned for this date.'); setLoading(false); return }

        // Fetch each recipe
        const fetched = await Promise.all(
          recipeIds.map((id) =>
            fetch(`/api/recipes/${id}`, { headers }).then((r) => (r.ok ? r.json() as Promise<Recipe> : null)),
          ),
        )

        const details: RecipeDetail[] = fetched
          .filter((r): r is Recipe => r !== null && !!(r.steps ?? '').trim())
          .map((r) => ({
            id:                 r.id,
            title:              r.title,
            steps:              (r.steps ?? '').split('\n').filter(Boolean),
            ingredients:        r.ingredients ?? '',
            servings:           r.servings ?? 4,
            total_time_minutes: r.total_time_minutes ?? null,
          }))

        if (details.length === 0) { setError('None of the planned recipes have steps.'); setLoading(false); return }

        setRecipes(details)
        setSelectedIds(new Set(details.map((r) => r.id)))
        if (details.length > 1) {
          setPhase('select')
        } else {
          setCombinedSteps(buildCombinedSteps(details))
        }
      } catch {
        setError('Something went wrong loading the recipes.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [params.date, mealTypeParam])

  // ── Wake lock ────────────────────────────────────────────────────────────

  useEffect(() => {
    async function acquire() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          setWakeLockActive(true)
          wakeLockRef.current.addEventListener('release', () => setWakeLockActive(false))
        }
      } catch { /* silently fail */ }
    }
    void acquire()
    const onVisible = () => { if (document.visibilityState === 'visible' && !wakeLockRef.current) void acquire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [])

  // ── Timer tick ───────────────────────────────────────────────────────────

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimers((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const [idx, state] of next) {
          if (state.running && state.remaining > 0) {
            next.set(idx, { ...state, remaining: state.remaining - 1 }); changed = true
          } else if (state.running && state.remaining === 0) {
            next.set(idx, { ...state, running: false, isExpired: true }); changed = true
            if (!chimedRef.current.has(idx)) {
              chimedRef.current.add(idx)
              try {
                const ctx = new AudioContext()
                ;[440, 550, 660].forEach((freq, i) => {
                  const osc = ctx.createOscillator(); const gain = ctx.createGain()
                  osc.connect(gain); gain.connect(ctx.destination)
                  osc.frequency.value = freq
                  gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.3)
                  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.3 + 0.3)
                  osc.start(ctx.currentTime + i * 0.3); osc.stop(ctx.currentTime + i * 0.3 + 0.3)
                })
              } catch { /* silently fail */ }
            }
          }
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  // ── Timer handlers ───────────────────────────────────────────────────────

  function handleTimerChange(stepIndex: number, state: TimerState | null) {
    setTimers((prev) => {
      const next = new Map(prev)
      if (state === null) { next.delete(stepIndex); chimedRef.current.delete(stepIndex) }
      else { next.set(stepIndex, state); if (state.remaining > 0) chimedRef.current.delete(stepIndex) }
      return next
    })
  }

  function handleTimerPause(stepIndex: number) {
    setTimers((prev) => {
      const state = prev.get(stepIndex)
      if (!state) return prev
      const next = new Map(prev)
      next.set(stepIndex, { ...state, running: !state.running })
      return next
    })
  }

  // ── Start cooking (from selection screen) ────────────────────────────────

  async function handleStartCooking() {
    const cooking = recipes.filter((r) => selectedIds.has(r.id))

    if (cooking.length <= 1) {
      setCombinedSteps(buildCombinedSteps(cooking))
      setCurrentStep(0)
      setPhase('cook')
      return
    }

    setPhase('ordering')
    setOrderError(null)

    try {
      const token = await getAccessToken()
      const res = await fetch('/api/cook/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipes: cooking.map((r) => ({ id: r.id, title: r.title, steps: r.steps })),
        }),
      })

      if (res.ok) {
        const data: { ordered: { recipeId: string; stepIndex: number }[] } = await res.json()
        const recipeMap = new Map(cooking.map((r) => [r.id, r]))
        const steps: CombinedStep[] = data.ordered.map(({ recipeId, stepIndex }) => {
          const r = recipeMap.get(recipeId)!
          return {
            text:             r.steps[stepIndex]!,
            recipeId:         r.id,
            recipeTitle:      r.title,
            ingredients:      r.ingredients,
            baseServings:     r.servings,
            recipeStepIndex:  stepIndex,
            recipeTotalSteps: r.steps.length,
          }
        })
        setCombinedSteps(steps)
      } else {
        // API error — fall back to simple sequential order
        setCombinedSteps(buildCombinedSteps(cooking))
      }
    } catch {
      // Network error — fall back
      setCombinedSteps(buildCombinedSteps(cooking))
    }

    setCurrentStep(0)
    setPhase('cook')
  }

  // ── Log all recipes ──────────────────────────────────────────────────────

  async function handleLogAll() {
    setLogStatus('loading')
    try {
      const token = await getAccessToken()
      const today = getTodayISO()
      const cookingRecipes = recipes.filter((r) => selectedIds.has(r.id))
      await Promise.all(
        cookingRecipes.map((r) =>
          fetch(`/api/recipes/${r.id}/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ made_on: today }),
          }),
        ),
      )
      setLogStatus('done')
      setTimeout(() => setLogStatus('idle'), TOAST_DURATION_LONG_MS)
    } catch {
      setLogStatus('idle')
    }
  }

  // ── Step rendering ───────────────────────────────────────────────────────

  function renderCurrentStep() {
    const step = combinedSteps[currentStep]
    if (!step) return null

    // Build the seen set for this recipe's prior steps within combinedSteps
    const seen = new Set<string>()
    for (let i = 0; i < currentStep; i++) {
      const s = combinedSteps[i]!
      if (s.recipeId === step.recipeId) {
        injectStepQuantities(s.text, s.ingredients, s.baseServings, s.baseServings, seen)
      }
    }
    const { text, highlights } = step.ingredients
      ? injectStepQuantities(step.text, step.ingredients, step.baseServings, step.baseServings, seen)
      : { text: step.text, highlights: [] }

    return (
      <div className="px-4 py-4">
        {/* Recipe badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-display font-bold uppercase tracking-[0.08em] text-white bg-sage-500 rounded-full px-2.5 py-0.5">
            {step.recipeTitle}
          </span>
          <span className="text-xs text-stone-400">
            Step {step.recipeStepIndex + 1} of {step.recipeTotalSteps}
          </span>
        </div>

        {/* Step number + text */}
        <div className="flex items-start gap-3 mb-4">
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sage-500 flex items-center justify-center text-white text-xs font-semibold mt-0.5">
            {currentStep + 1}
          </span>
          <p className="text-stone-800 font-sans text-xl leading-[1.7]">
            {renderHighlighted(text, highlights)}
          </p>
        </div>

        {/* Timer */}
        <StepTimer
          stepIndex={currentStep}
          stepText={step.text}
          timerState={timers.get(currentStep)}
          onChange={(state: TimerState | null) => handleTimerChange(currentStep, state)}
        />

        {/* Dot progress */}
        <div className="flex justify-center gap-1.5 mt-6 flex-wrap">
          {combinedSteps.map((s, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Step ${i + 1}`}
              onClick={() => setCurrentStep(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentStep
                  ? 'bg-sage-500'
                  : s.recipeId === step.recipeId
                  ? 'bg-sage-200'
                  : 'bg-stone-200'
              }`}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Guards ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-400 font-sans">
        Loading recipes…
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-stone-500 font-sans">{error}</p>
        <button
          onClick={() => router.back()}
          className="text-sm text-sage-600 underline"
        >
          Go back
        </button>
      </div>
    )
  }

  // ── Selection screen ─────────────────────────────────────────────────────

  if (phase === 'ordering') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-6">
        <div className="w-8 h-8 rounded-full border-2 border-sage-400 border-t-transparent animate-spin" />
        <p className="text-stone-500 font-sans text-sm">Optimising cooking order…</p>
        {orderError && (
          <p className="text-stone-400 text-xs">{orderError}</p>
        )}
      </div>
    )
  }

  if (phase === 'select') {
    return (
      <div className="min-h-screen bg-stone-50 pb-28">
        <div className="bg-sage-900 fixed top-0 left-0 right-0 z-40 h-14 flex items-center px-4 gap-3">
          <Link
            href={`/calendar?week_start=${getMostRecentSunday(new Date(params.date + 'T12:00:00Z'))}`}
            className="text-white/70 hover:text-white transition-colors shrink-0"
            aria-label="Exit cook mode"
          >
            ✕
          </Link>
          <p className="text-white font-display font-semibold text-sm">
            What are you cooking?
          </p>
        </div>

        <div className="pt-14 px-4 py-6 space-y-3">
          <p className="text-sm text-stone-400 mb-4">Select the recipes you want to cook right now.</p>

          {recipes.map((r) => {
            const checked = selectedIds.has(r.id)
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(r.id)) { next.delete(r.id) } else { next.add(r.id) }
                    return next
                  })
                }}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
                  checked
                    ? 'border-sage-400 bg-sage-50'
                    : 'border-stone-200 bg-white'
                }`}
              >
                <span
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                    checked ? 'border-sage-500 bg-sage-500' : 'border-stone-300'
                  }`}
                >
                  {checked && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-800 truncate">{r.title}</p>
                  {r.total_time_minutes != null && (
                    <p className="text-xs text-stone-400 mt-0.5">{r.total_time_minutes} min</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-sage-900 px-4 py-4">
          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={() => { void handleStartCooking() }}
            className="w-full font-display text-sm font-medium bg-terra-500 text-white py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Start cooking
            {selectedIds.size > 0 && ` (${selectedIds.size} recipe${selectedIds.size !== 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    )
  }

  const isLastStep = currentStep === combinedSteps.length - 1

  return (
    <div className="min-h-screen bg-stone-50 pb-28">
      {/* Header */}
      <div className="bg-sage-900 fixed top-0 left-0 right-0 z-40 h-14 flex items-center px-4 gap-3">
        <Link
          href={`/calendar?week_start=${getMostRecentSunday(new Date(params.date + 'T12:00:00Z'))}`}
          className="text-white/70 hover:text-white transition-colors shrink-0"
          aria-label="Exit cook mode"
        >
          ✕
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-white font-display font-semibold text-sm leading-tight truncate">
            {recipes.map((r) => r.title).join(' + ')}
          </p>
          <p className="text-white/60 text-[11px] mt-0.5">
            {combinedSteps.length} steps across {recipes.length} recipe{recipes.length !== 1 ? 's' : ''}
          </p>
        </div>
        {wakeLockActive && (
          <span className="text-white/40 text-[10px] shrink-0">Screen on</span>
        )}
      </div>

      <div className="pt-14">
        {/* Active Timers Bar */}
        <ActiveTimersBar
          timers={[...timers.values()]}
          onPause={handleTimerPause}
          onReset={(idx) => handleTimerChange(idx, null)}
          onDismiss={(idx) => handleTimerChange(idx, null)}
        />

        {/* Step content */}
        {renderCurrentStep()}
      </div>

      {/* Fixed footer */}
      <div className="bg-sage-900 fixed bottom-0 left-0 right-0 z-40 px-4 py-4 flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={currentStep === 0}
          onClick={() => setCurrentStep((s) => s - 1)}
          className="font-medium text-sm text-white/80 disabled:opacity-40 min-h-[44px] px-4"
        >
          ← Prev
        </button>
        <span className="text-white/60 text-xs">
          {currentStep + 1} / {combinedSteps.length}
        </span>
        {isLastStep ? (
          <button
            type="button"
            onClick={handleLogAll}
            disabled={logStatus === 'loading' || logStatus === 'done'}
            className="font-display text-sm font-medium bg-terra-500 text-white px-4 py-2 rounded-lg disabled:opacity-60 min-h-[44px]"
          >
            {logStatus === 'done' ? '✓ Logged!' : logStatus === 'loading' ? 'Saving…' : 'Finish cooking'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCurrentStep((s) => s + 1)}
            className="font-medium text-sm text-white/80 min-h-[44px] px-4"
          >
            Next →
          </button>
        )}
      </div>
    </div>
  )
}
