'use client'

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

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
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      {/* Popover */}
      <div
        role="dialog"
        aria-label="Assign to a different day"
        className="absolute z-50 mt-1 bg-white rounded-xl shadow-lg border border-stone-200 min-w-[180px] overflow-hidden"
      >
        <div className="p-2">
          <p className="text-xs font-semibold text-stone-400 uppercase px-2 pb-1">Use for…</p>
          {options.length === 0 && (
            <p className="text-sm text-stone-400 px-2 py-1">No other days available</p>
          )}
          {options.map((date) => (
            <button
              key={date}
              onClick={() => { onSelect(date); onClose() }}
              className="w-full text-left px-3 py-2 text-sm text-stone-700 rounded-lg hover:bg-stone-50 transition-colors"
            >
              {formatDate(date)}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
