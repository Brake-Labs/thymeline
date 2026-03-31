'use client'

import type React from 'react'
import StepTimer, { type TimerState } from './StepTimer'
import { injectStepQuantities, type HighlightRange } from '@/lib/inject-step-quantities'

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

function renderHighlighted(text: string, highlights: HighlightRange[]): React.ReactNode {
  if (highlights.length === 0) return text
  const nodes: React.ReactNode[] = []
  let cursor = 0
  highlights.forEach((h, i) => {
    if (h.start > cursor) nodes.push(text.slice(cursor, h.start))
    nodes.push(
      <span key={i} style={{ color: '#C97D4E', fontWeight: 500 }}>
        {text.slice(h.start, h.end)}
      </span>,
    )
    cursor = h.end
  })
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
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
              <p className="text-stone-700 text-sm leading-relaxed" style={{ color: '#3D3028' }}>
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
