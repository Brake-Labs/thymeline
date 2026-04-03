'use client'

import { useRef } from 'react'
import type React from 'react'
import StepTimer, { type TimerState } from './StepTimer'
import { injectStepQuantities } from '@/lib/inject-step-quantities'
import { renderHighlighted } from './renderHighlighted'

interface Props {
  steps: string[]
  stepPhotos: { stepIndex: number; imageUrl: string }[]
  currentStep: number
  onCurrentStepChange: (i: number) => void
  timers: Map<number, TimerState>
  onTimerChange: (stepIndex: number, state: TimerState | null) => void
  ingredients?: string
  baseServings?: number
  targetServings?: number
}

export default function SingleStepView({
  steps,
  stepPhotos,
  currentStep,
  onCurrentStepChange,
  timers,
  onTimerChange,
  ingredients,
  baseServings = 4,
  targetServings = 4,
}: Props) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const photo = stepPhotos.find((p) => p.stepIndex === currentStep)

  // Build the set of ingredients already annotated in prior steps so each
  // ingredient's quantity is only shown the first time it appears in the recipe.
  const seen = new Set<string>()
  if (ingredients) {
    for (let i = 0; i < currentStep; i++) {
      injectStepQuantities(steps[i] ?? '', ingredients, targetServings, baseServings, seen)
    }
  }

  const { text: stepText, highlights } =
    ingredients
      ? injectStepQuantities(steps[currentStep] ?? '', ingredients, targetServings, baseServings, seen)
      : { text: steps[currentStep] ?? '', highlights: [] }

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    if (!t) return
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - touchStartRef.current.x
    const dy = Math.abs(t.clientY - touchStartRef.current.y)
    touchStartRef.current = null
    if (Math.abs(dx) >= 50 && dy < 30) {
      if (dx < 0 && currentStep < steps.length - 1) {
        onCurrentStepChange(currentStep + 1)
      } else if (dx > 0 && currentStep > 0) {
        onCurrentStepChange(currentStep - 1)
      }
    }
  }

  return (
    <div
      className="px-4 py-4"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Step photo */}
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.imageUrl}
          alt={`Step ${currentStep + 1}`}
          className="w-full rounded-lg object-cover mb-4 max-h-60"
        />
      )}

      {/* Step number badge + text */}
      <div className="flex items-start gap-3 mb-4">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sage-500 flex items-center justify-center text-white text-xs font-semibold mt-0.5">
          {currentStep + 1}
        </span>
        <p
          className="text-stone-800 font-sans text-xl leading-[1.7]"
        >
          {renderHighlighted(stepText, highlights)}
        </p>
      </div>

      {/* Timer */}
      <StepTimer
        stepIndex={currentStep}
        stepText={steps[currentStep] ?? ''}
        timerState={timers.get(currentStep)}
        onChange={(state) => onTimerChange(currentStep, state)}
      />

      {/* Dot progress */}
      <div className="flex justify-center gap-2 mt-6">
        {steps.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Step ${i + 1}`}
            onClick={() => onCurrentStepChange(i)}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === currentStep ? 'bg-sage-500' : 'bg-stone-300'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
