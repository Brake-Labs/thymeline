'use client'

import { useState, useEffect } from 'react'
import type React from 'react'

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
    candidates.push(parseInt(m[1]!, 10) * 3600 + parseInt(m[2]!, 10) * 60)
  }

  // "X to Y minutes" or "X–Y minutes" (en-dash or hyphen) → use Y (higher value)
  for (const m of text.matchAll(/\d+\s*(?:to|[-–])\s*(\d+)\s*(?:minutes?|mins?)/gi)) {
    candidates.push(parseInt(m[1]!, 10) * 60)
  }

  // "X hours" / "X hour"
  for (const m of text.matchAll(/(\d+)\s*(?:hours?|hr)/gi)) {
    candidates.push(parseInt(m[1]!, 10) * 3600)
  }

  // "X minutes" / "X mins"
  for (const m of text.matchAll(/(\d+)\s*(?:minutes?|mins?)/gi)) {
    candidates.push(parseInt(m[1]!, 10) * 60)
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
    const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseInt(e.target.value)
      if (!isNaN(v)) setPickMinutes(v)
      else if (e.target.value === '') setPickMinutes(0)
    }

    const handleMinutesBlur = () => {
      setPickMinutes((m) => Math.min(999, Math.max(0, m)))
    }

    const handleSecondsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseInt(e.target.value)
      if (!isNaN(v)) setPickSeconds(v)
      else if (e.target.value === '') setPickSeconds(0)
    }

    const handleSecondsBlur = () => {
      if (pickSeconds > 59) {
        const carry = Math.floor(pickSeconds / 60)
        const rem = pickSeconds % 60
        setPickMinutes((m) => Math.min(999, m + carry))
        setPickSeconds(rem)
      } else {
        setPickSeconds((s) => Math.max(0, s))
      }
    }

    const handleSecondsIncrement = () => {
      if (pickSeconds >= 59) {
        setPickMinutes((m) => Math.min(999, m + 1))
        setPickSeconds(0)
      } else {
        setPickSeconds((s) => s + 1)
      }
    }

    return (
      <div className="flex items-center gap-3 mt-2">
        {/* Minutes field */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            aria-label="Increment minutes"
            onClick={() => setPickMinutes((m) => Math.min(999, m + 1))}
            className="text-stone-400 hover:text-stone-700 text-[10px] leading-none px-1"
          >
            ▲
          </button>
          <input
            type="number"
            aria-label="Minutes"
            value={pickMinutes}
            onChange={handleMinutesChange}
            onBlur={handleMinutesBlur}
            onFocus={(e) => e.target.select()}
            min="0"
            max="999"
            className="w-12 text-center text-base border border-stone-300 rounded focus:outline-none focus:border-sage-500 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none font-display text-sage-900 font-medium"
          />
          <button
            type="button"
            aria-label="Decrement minutes"
            onClick={() => setPickMinutes((m) => Math.max(0, m - 1))}
            className="text-stone-400 hover:text-stone-700 text-[10px] leading-none px-1"
          >
            ▼
          </button>
        </div>

        <span className="text-stone-500 font-medium text-lg self-center">:</span>

        {/* Seconds field */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            aria-label="Increment seconds"
            onClick={handleSecondsIncrement}
            className="text-stone-400 hover:text-stone-700 text-[10px] leading-none px-1"
          >
            ▲
          </button>
          <input
            type="number"
            aria-label="Seconds"
            value={pickSeconds}
            onChange={handleSecondsChange}
            onBlur={handleSecondsBlur}
            onFocus={(e) => e.target.select()}
            min="0"
            max="59"
            className="w-12 text-center text-base border border-stone-300 rounded focus:outline-none focus:border-sage-500 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none font-display text-sage-900 font-medium"
          />
          <button
            type="button"
            aria-label="Decrement seconds"
            onClick={() => setPickSeconds((s) => Math.max(0, s - 1))}
            className="text-stone-400 hover:text-stone-700 text-[10px] leading-none px-1"
          >
            ▼
          </button>
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
          className="text-xs bg-sage-500 text-white rounded px-2 py-1 self-center"
        >
          Start
        </button>
        <button
          type="button"
          onClick={() => setShowPicker(false)}
          className="text-xs border rounded px-2 py-1 self-center"
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
