'use client'

import { type TimerState, formatTime } from './StepTimer'

interface Props {
  timers: TimerState[]
  onPause: (stepIndex: number) => void
  onReset: (stepIndex: number) => void
  onDismiss: (stepIndex: number) => void
}

export default function ActiveTimersBar({ timers, onPause, onReset, onDismiss }: Props) {
  const visible = timers.filter((t) => t.running || t.isExpired)

  if (visible.length === 0) return null

  return (
    <div className="bg-sage-900 px-4 py-2 flex flex-col gap-2">
      {visible.map((timer) => {
        const originalDuration = formatTime(timer.minutes * 60 + timer.seconds)

        return (
          <div key={timer.stepIndex} className="flex items-center gap-3 min-h-[40px]">
            {/* Action + original duration badge */}
            <span className="bg-sage-500/40 text-xs rounded px-1.5 py-0.5 font-medium shrink-0 text-white/90">
              {timer.label} for {originalDuration}
            </span>

            {/* Countdown or expired */}
            {timer.isExpired ? (
              <span className="text-red-400 text-sm font-semibold flex-1">Time&apos;s up!</span>
            ) : (
              <span
                className="text-white flex-1 tabular-nums font-display font-bold text-base"
              >
                {formatTime(timer.remaining)}
              </span>
            )}

            {/* Pause / Resume */}
            {!timer.isExpired && (
              <button
                type="button"
                onClick={() => onPause(timer.stepIndex)}
                aria-label={timer.running ? 'Pause timer' : 'Resume timer'}
                className="text-white/70 hover:text-white text-sm w-7 h-7 flex items-center justify-center"
              >
                {timer.running ? '⏸' : '▶'}
              </button>
            )}

            {/* Reset */}
            <button
              type="button"
              onClick={() => onReset(timer.stepIndex)}
              aria-label="Reset timer"
              className="text-white/70 hover:text-white text-sm w-7 h-7 flex items-center justify-center"
            >
              ↺
            </button>

            {/* Dismiss (expired only) */}
            {timer.isExpired && (
              <button
                type="button"
                onClick={() => onDismiss(timer.stepIndex)}
                aria-label="Dismiss timer"
                className="text-white/70 hover:text-white text-sm w-7 h-7 flex items-center justify-center"
              >
                ×
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
