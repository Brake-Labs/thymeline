'use client'

import { useMemo } from 'react'

interface WeekPickerProps {
  weekStart: string
  onChange: (weekStart: string) => void
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00Z')
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${fmt(start)} – ${fmt(end)}`
}

function getMostRecentSunday(date: Date): string {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function WeekPicker({ weekStart, onChange }: WeekPickerProps) {
  const currentSunday = useMemo(() => getMostRecentSunday(new Date()), [])
  const maxSunday = useMemo(() => addDays(currentSunday, 28), [currentSunday])

  const isPrevDisabled = weekStart <= currentSunday
  const isNextDisabled = weekStart >= maxSunday

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(addDays(weekStart, -7))}
        disabled={isPrevDisabled}
        aria-label="Previous week"
        className="p-1.5 rounded-full hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-5 h-5 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <span className="text-base font-medium text-stone-800 min-w-[10rem] text-center">
        {formatWeekRange(weekStart)}
      </span>

      <button
        onClick={() => onChange(addDays(weekStart, 7))}
        disabled={isNextDisabled}
        aria-label="Next week"
        className="p-1.5 rounded-full hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-5 h-5 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}
