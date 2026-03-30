'use client'

import { useState, useEffect } from 'react'

export interface TimerState {
  minutes: number
  seconds: number
  remaining: number  // seconds left
  running: boolean
  isExpired: boolean
  stepIndex: number
  label: string
}

// ── Time parsing ──────────────────────────────────────────────────────────────

export function parseTimeFromStep(text: string): number {
  const candidates: number[] = []

  // "X hours and Y minutes" / "X hr Y min"
  for (const m of text.matchAll(/(\d+)\s*(?:hours?|hr)\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?)/gi)) {
    candidates.push(parseInt(m[1]) * 3600 + parseInt(m[2]) * 60)
  }

  // "X to Y minutes" or "X–Y minutes" (en-dash or hyphen) → use Y (higher value)
  for (const m of text.matchAll(/\d+\s*(?:to|[-–])\s*(\d+)\s*(?:minutes?|mins?)/gi)) {
    candidates.push(parseInt(m[1]) * 60)
  }

  // "X hours" / "X hour"
  for (const m of text.matchAll(/(\d+)\s*(?:hours?|hr)/gi)) {
    candidates.push(parseInt(m[1]) * 3600)
  }

  // "X minutes" / "X mins"
  for (const m of text.matchAll(/(\d+)\s*(?:minutes?|mins?)/gi)) {
    candidates.push(parseInt(m[1]) * 60)
  }

  return candidates.length > 0 ? Math.max(...candidates) : 0
}

// ── Label derivation ──────────────────────────────────────────────────────────

const COOKING_ACTIONS = [
  'simmer', 'bake', 'boil', 'roast', 'knead', 'rest', 'marinate', 'fry',
  'saute', 'steam', 'grill', 'chill', 'freeze', 'soak', 'reduce',
  'caramelize', 'whisk', 'fold',
]

const DISPLAY_OVERRIDES: Record<string, string> = { saute: 'Sauté' }

export function deriveTimerLabel(stepText: string): string {
  const normalized = stepText.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  for (const action of COOKING_ACTIONS) {
    if (normalized.includes(action)) {
      return DISPLAY_OVERRIDES[action] ?? (action.charAt(0).toUpperCase() + action.slice(1))
    }
  }
  // Fallback: first 3 words + ellipsis, max 20 chars
  const words = stepText.trim().split(/\s+/)
  const base = words.slice(0, 3).join(' ')
  const label = base + '…'
  return label.length <= 20 ? label : label.slice(0, 19) + '…'
}

// ── Time formatting ───────────────────────────────────────────────────────────

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  stepIndex: number
  stepText?: string
  timerState: TimerState | undefined
  onChange: (state: TimerState | null) => void
}

export default function StepTimer({ stepIndex, stepText, timerState, onChange }: Props) {
  const [pickMinutes, setPickMinutes] = useState(5)
  const [pickSeconds, setPickSeconds] = useState(0)
  const [showPicker, setShowPicker] = useState(false)

  // Auto-populate picker from step text
  useEffect(() => {
    if (!stepText) return
    const totalSeconds = parseTimeFromStep(stepText)
    if (totalSeconds > 0) {
      setPickMinutes(Math.floor(totalSeconds / 60))
      setPickSeconds(totalSeconds % 60)
    }
  }, [stepText])

  if (timerState) {
    const done = timerState.remaining === 0
    const display = formatTime(timerState.remaining)

    return (
      <div className="flex items-center gap-2 mt-2">
        {done ? (
          <span className="text-red-500 font-semibold text-sm">Time&apos;s up!</span>
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
              onChange({
                minutes: pickMinutes,
                seconds: pickSeconds,
                remaining: total,
                running: true,
                isExpired: false,
                stepIndex,
                label: deriveTimerLabel(stepText ?? ''),
              })
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
