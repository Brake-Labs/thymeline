'use client'

import { type TimerState } from './StepTimer'
import SingleStepView from './SingleStepView'
import ScrollStepView from './ScrollStepView'

interface Props {
  steps: string[]
  stepPhotos: { stepIndex: number; imageUrl: string }[]
  currentStep: number
  onCurrentStepChange: (i: number) => void
  view: 'one' | 'all'
  onViewChange: (v: 'one' | 'all') => void
  timers: Map<number, TimerState>
  onTimerChange: (stepIndex: number, state: TimerState | null) => void
  ingredients?: string
  baseServings?: number
  targetServings?: number
}

export default function StepView({
  steps,
  stepPhotos,
  currentStep,
  onCurrentStepChange,
  view,
  onViewChange,
  timers,
  onTimerChange,
  ingredients,
  baseServings,
  targetServings,
}: Props) {
  return (
    <div>
      {/* Segmented toggle */}
      <div className="flex border-b border-stone-200 px-4 pt-2">
        {(['one', 'all'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onViewChange(v)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              view === v
                ? 'border-b-2 border-sage-500 text-sage-600'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {v === 'one' ? 'One at a time' : 'All steps'}
          </button>
        ))}
      </div>

      {view === 'one' ? (
        <SingleStepView
          steps={steps}
          stepPhotos={stepPhotos}
          currentStep={currentStep}
          onCurrentStepChange={onCurrentStepChange}
          timers={timers}
          onTimerChange={onTimerChange}
          ingredients={ingredients}
          baseServings={baseServings}
          targetServings={targetServings}
        />
      ) : (
        <ScrollStepView
          steps={steps}
          stepPhotos={stepPhotos}
          currentStep={currentStep}
          onCurrentStepChange={onCurrentStepChange}
          timers={timers}
          onTimerChange={onTimerChange}
          ingredients={ingredients}
          baseServings={baseServings}
          targetServings={targetServings}
        />
      )}
    </div>
  )
}
