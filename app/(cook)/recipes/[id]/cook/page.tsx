'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import CookHeader from '@/components/cook/CookHeader'
import StepView from '@/components/cook/StepView'
import IngredientChecklist from '@/components/cook/IngredientChecklist'
import VoiceControl, { type VoiceCommand } from '@/components/cook/VoiceControl'
import { type TimerState } from '@/components/cook/StepTimer'
import { getAccessToken } from '@/lib/supabase/browser'
import { type Recipe } from '@/types'

type RecipeWithHistory = Recipe & { last_made: string | null; times_made: number }

interface Props {
  params: { id: string }
}

export default function CookModePage({ params }: Props) {
  const router = useRouter()
  const [recipe, setRecipe] = useState<RecipeWithHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentStep, setCurrentStep] = useState(0)
  const [view, setView] = useState<'one' | 'all'>('one')
  const [servings, setServings] = useState(4)
  const [activeTab, setActiveTab] = useState<'steps' | 'ingredients'>('steps')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [timers, setTimers] = useState<Map<number, TimerState>>(new Map())
  const [logStatus, setLogStatus] = useState<'idle' | 'loading' | 'success' | 'already_logged'>('idle')
  const [wakeLockActive, setWakeLockActive] = useState(false)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chimedRef = useRef<Set<number>>(new Set())

  // Fetch recipe
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/recipes/${params.id}`, {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
        })
        if (!res.ok) { router.replace(`/recipes/${params.id}`); return }
        const data: RecipeWithHistory = await res.json()
        const steps = (data.steps ?? '').split('\n').filter(Boolean)
        if (steps.length === 0) { router.replace(`/recipes/${params.id}`); return }
        setRecipe(data)
        setServings(data.servings ?? 4)
      } catch {
        router.replace(`/recipes/${params.id}`)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [params.id, router])

  // Wake lock
  useEffect(() => {
    async function acquireWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          setWakeLockActive(true)
          wakeLockRef.current.addEventListener('release', () => {
            setWakeLockActive(false)
          })
        }
      } catch {
        // Silently fail
      }
    }
    void acquireWakeLock()

    function handleVisibility() {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        void acquireWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [])

  // Global timer interval
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimers((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const [idx, state] of next) {
          if (state.running && state.remaining > 0) {
            next.set(idx, { ...state, remaining: state.remaining - 1 })
            changed = true
          } else if (state.running && state.remaining === 0) {
            // Stop running
            next.set(idx, { ...state, running: false })
            changed = true
            // Chime once
            if (!chimedRef.current.has(idx)) {
              chimedRef.current.add(idx)
              playChime()
            }
          }
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  function playChime() {
    try {
      const ctx = new AudioContext()
      const tones = [440, 550, 660]
      tones.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.3)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.3 + 0.3)
        osc.start(ctx.currentTime + i * 0.3)
        osc.stop(ctx.currentTime + i * 0.3 + 0.3)
      })
    } catch {
      // Silently fail
    }
  }

  function handleTimerChange(stepIndex: number, state: TimerState | null) {
    setTimers((prev) => {
      const next = new Map(prev)
      if (state === null) {
        next.delete(stepIndex)
        chimedRef.current.delete(stepIndex)
      } else {
        next.set(stepIndex, state)
        // Reset chime tracking when timer is (re)started
        if (state.remaining > 0) chimedRef.current.delete(stepIndex)
      }
      return next
    })
  }

  async function handleLog() {
    setLogStatus('loading')
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch(`/api/recipes/${params.id}/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({ made_on: today }),
      })
      if (res.ok) {
        const data: { made_on: string; already_logged: boolean } = await res.json()
        setLogStatus(data.already_logged ? 'already_logged' : 'success')
        setTimeout(() => setLogStatus('idle'), 3000)
      } else {
        setLogStatus('idle')
      }
    } catch {
      setLogStatus('idle')
    }
  }

  function handleVoiceCommand(cmd: VoiceCommand) {
    if (!recipe) return
    const steps = (recipe.steps ?? '').split('\n').filter(Boolean)
    switch (cmd.type) {
      case 'next':
        setCurrentStep((s) => Math.min(steps.length - 1, s + 1))
        break
      case 'prev':
        setCurrentStep((s) => Math.max(0, s - 1))
        break
      case 'setTimer':
        handleTimerChange(currentStep, {
          minutes: cmd.minutes,
          seconds: cmd.seconds,
          remaining: cmd.minutes * 60 + cmd.seconds,
          running: true,
        })
        break
      case 'checkIngredient': {
        if (!recipe.ingredients) break
        const lines = recipe.ingredients.split('\n').filter(Boolean)
        const needle = cmd.name.toLowerCase()
        const idx = lines.findIndex((l) => l.toLowerCase().includes(needle))
        if (idx >= 0) {
          setChecked((prev) => {
            const next = new Set(prev)
            next.add(idx)
            return next
          })
        }
        break
      }
      case 'readStep':
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          const utt = new SpeechSynthesisUtterance(steps[currentStep])
          window.speechSynthesis.speak(utt)
        }
        break
    }
  }

  if (loading || !recipe) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-400 font-sans">
        Loading…
      </div>
    )
  }

  const steps = (recipe.steps ?? '').split('\n').filter(Boolean)
  const isLastStep = currentStep === steps.length - 1

  return (
    <div className="min-h-screen bg-stone-50 pt-14 pb-28">
      <CookHeader
        recipeId={params.id}
        title={recipe.title}
        servings={servings}
        baseServings={recipe.servings ?? 4}
        onServingsChange={setServings}
        wakeLockActive={wakeLockActive}
      />

      {/* Tab bar */}
      <div className="flex border-b border-stone-200 bg-white sticky top-14 z-30">
        {(['steps', 'ingredients'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-sage-500 text-sage-600'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {tab === 'steps' ? 'Steps' : 'Ingredients'}
          </button>
        ))}
      </div>

      {/* Body */}
      {activeTab === 'steps' ? (
        <StepView
          steps={steps}
          stepPhotos={recipe.step_photos ?? []}
          currentStep={currentStep}
          onCurrentStepChange={setCurrentStep}
          view={view}
          onViewChange={setView}
          timers={timers}
          onTimerChange={handleTimerChange}
        />
      ) : (
        recipe.ingredients ? (
          <IngredientChecklist
            ingredients={recipe.ingredients}
            baseServings={recipe.servings ?? 4}
            targetServings={servings}
            checked={checked}
            onToggle={(i) =>
              setChecked((prev) => {
                const next = new Set(prev)
                if (next.has(i)) next.delete(i)
                else next.add(i)
                return next
              })
            }
            onCheckAll={() => {
              const lines = recipe.ingredients!.split('\n').filter(Boolean)
              setChecked(new Set(lines.map((_, i) => i)))
            }}
            onUncheckAll={() => setChecked(new Set())}
          />
        ) : (
          <p className="px-4 py-8 text-stone-400 text-sm">No ingredients listed.</p>
        )
      )}

      {/* Voice control */}
      <VoiceControl onCommand={handleVoiceCommand} />

      {/* Fixed footer */}
      <div
        style={{ backgroundColor: '#1F2D26' }}
        className="fixed bottom-0 left-0 right-0 z-40 px-4 py-4 flex items-center justify-between gap-3"
      >
        {view === 'one' && (
          <>
            <button
              type="button"
              disabled={currentStep === 0}
              onClick={() => setCurrentStep((s) => s - 1)}
              className="font-medium text-sm text-white/80 disabled:opacity-40 min-h-[44px] px-4"
            >
              ← Prev
            </button>
            <span className="text-white/60 text-xs">
              Step {currentStep + 1} of {steps.length}
            </span>
            {isLastStep ? (
              <button
                type="button"
                onClick={handleLog}
                disabled={logStatus === 'loading'}
                className="font-medium text-sm bg-white text-stone-800 rounded-xl py-2 px-4 min-h-[44px] disabled:opacity-50"
              >
                {logStatus === 'success' ? '✓ Logged!' : logStatus === 'already_logged' ? 'Already logged today' : 'Log Made Today'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentStep((s) => s + 1)}
                className="font-medium text-sm text-white min-h-[44px] px-4"
              >
                Next →
              </button>
            )}
          </>
        )}
        {view === 'all' && (
          <button
            type="button"
            onClick={handleLog}
            disabled={logStatus === 'loading'}
            className="w-full font-medium text-sm bg-white text-stone-800 rounded-xl py-3 disabled:opacity-50"
          >
            {logStatus === 'success' ? '✓ Logged!' : logStatus === 'already_logged' ? 'Already logged today' : 'Log Made Today'}
          </button>
        )}
      </div>
    </div>
  )
}
