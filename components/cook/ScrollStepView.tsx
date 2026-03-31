'use client'

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

export default function ScrollStepView({
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
  return (
    <div className="px-4 py-4 space-y-4">
      {steps.map((step, i) => {
        const photo = stepPhotos.find((p) => p.stepIndex === i)
        const isCurrent = i === currentStep
        const isPast = i < currentStep

        const { text: stepText, highlights } =
          ingredients
            ? injectStepQuantities(step, ingredients, targetServings, baseServings)
            : { text: step, highlights: [] }

        return (
          <div
            key={i}
            onClick={() => onCurrentStepChange(i)}
            className={`p-4 rounded-lg border cursor-pointer transition-opacity ${
              isCurrent
                ? 'border-l-4 border-sage-500 border-t-stone-200 border-r-stone-200 border-b-stone-200 bg-white'
                : 'border-stone-200 bg-white'
            } ${isPast ? 'opacity-50' : ''}`}
          >
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.imageUrl}
                alt={`Step ${i + 1}`}
                className="w-full rounded-lg object-cover mb-3"
                style={{ maxHeight: 240 }}
              />
            )}
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sage-500 flex items-center justify-center text-white text-xs font-semibold">
                {i + 1}
              </span>
              <p className="text-[#3D3028] text-sm leading-relaxed">
                {renderHighlighted(stepText, highlights)}
              </p>
            </div>
            <StepTimer
              stepIndex={i}
              timerState={timers.get(i)}
              onChange={(state) => onTimerChange(i, state)}
            />
          </div>
        )
      })}
    </div>
  )
}
