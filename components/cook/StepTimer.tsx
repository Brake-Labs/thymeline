'use client'

import { useState } from 'react'

export interface TimerState {
  minutes: number
  seconds: number
  remaining: number  // seconds left
  running: boolean
}

interface Props {
  stepIndex: number
  timerState: TimerState | undefined
  onChange: (state: TimerState | null) => void
}

export default function StepTimer({ stepIndex: _stepIndex, timerState, onChange }: Props) {
  const [pickMinutes, setPickMinutes] = useState(5)
  const [pickSeconds, setPickSeconds] = useState(0)
  const [showPicker, setShowPicker] = useState(false)

  if (timerState) {
    const mins = Math.floor(timerState.remaining / 60)
    const secs = timerState.remaining % 60
    const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    const done = timerState.remaining === 0

    return (
      <div className="flex items-center gap-2 mt-2">
        {done ? (
          <span className="text-red-500 font-semibold text-sm">Time's up!</span>
        ) : (
          <span className="font-mono text-lg">{display}</span>
        )}
        <button
          type="button"
          onClick={() => onChange({ ...timerState, running: !timerState.running })}
          className="text-xs border border-stone-300 rounded px-2 py-1"
        >
          {timerState.running ? 'Pause' : 'Resume'}
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs border border-stone-300 rounded px-2 py-1"
        >
          Reset
        </button>
      </div>
    )
  }

  if (showPicker) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPickMinutes((m) => Math.max(0, m - 1))} className="border rounded px-1">−</button>
          <span className="w-8 text-center text-sm">{pickMinutes}m</span>
          <button type="button" onClick={() => setPickMinutes((m) => m + 1)} className="border rounded px-1">+</button>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPickSeconds((s) => Math.max(0, s - 5))} className="border rounded px-1">−</button>
          <span className="w-8 text-center text-sm">{pickSeconds}s</span>
          <button type="button" onClick={() => setPickSeconds((s) => s + 5)} className="border rounded px-1">+</button>
        </div>
        <button
          type="button"
          onClick={() => {
            const total = pickMinutes * 60 + pickSeconds
            if (total > 0) {
              onChange({ minutes: pickMinutes, seconds: pickSeconds, remaining: total, running: true })
              setShowPicker(false)
            }
          }}
          className="text-xs bg-sage-500 text-white rounded px-2 py-1"
        >
          Start
        </button>
        <button
          type="button"
          onClick={() => setShowPicker(false)}
          className="text-xs border rounded px-2 py-1"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setShowPicker(true)}
      className="mt-2 text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1"
    >
      ⏱ Set timer
    </button>
  )
}
