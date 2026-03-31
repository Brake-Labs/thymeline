'use client'

import { formatDayName as formatDate } from '@/lib/date-utils'

interface AssignDayPickerProps {
  activeDates: string[]
  excludeDate: string
  onSelect: (targetDate: string) => void
  onClose: () => void
}

export default function AssignDayPicker({ activeDates, excludeDate, onSelect, onClose }: AssignDayPickerProps) {
  const options = activeDates.filter((d) => d !== excludeDate)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} aria-hidden="true" />
      {/* Modal — fixed so it's never clipped by overflow-hidden parents */}
      <div
        role="dialog"
        aria-label="Use for a different day"
        className="fixed inset-x-4 bottom-4 z-50 bg-white rounded-2xl shadow-xl border border-stone-200 p-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-72"
      >
        <p className="text-sm font-semibold text-stone-700 mb-3">Use for a different day</p>
        {options.length === 0 && (
          <p className="text-sm text-stone-400 px-1">No other days available</p>
        )}
        {options.map((date) => (
          <button
            key={date}
            onClick={() => { onSelect(date); onClose() }}
            className="w-full text-left px-3 py-2.5 text-sm text-stone-700 rounded-xl hover:bg-stone-50 transition-colors"
          >
            {formatDate(date)}
          </button>
        ))}
        <button
          onClick={onClose}
          className="mt-2 w-full text-xs text-stone-400 hover:text-stone-600 py-1.5 transition-colors"
        >
          Cancel
        </button>
      </div>
    </>
  )
}
