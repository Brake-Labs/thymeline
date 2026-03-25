'use client'

import { useRouter } from 'next/navigation'
import { addDays, getCurrentWeekSunday } from '@/lib/grocery'

interface GroceryDateRangeSelectorProps {
  dateFrom: string
  dateTo:   string
}

function nextSunday(from: string): string {
  return addDays(from, 7)
}

export default function GroceryDateRangeSelector({ dateFrom, dateTo }: GroceryDateRangeSelectorProps) {
  const router = useRouter()

  const thisWeekFrom = getCurrentWeekSunday()
  const thisWeekTo   = addDays(thisWeekFrom, 6)
  const nextWeekFrom = addDays(thisWeekFrom, 7)
  const nextWeekTo   = addDays(thisWeekFrom, 13)
  const twoWeeksFrom = thisWeekFrom
  const twoWeeksTo   = addDays(thisWeekFrom, 13)

  function navigate(from: string, to: string) {
    router.push(`/groceries?date_from=${from}&date_to=${to}`)
  }

  function isActive(from: string, to: string) {
    return dateFrom === from && dateTo === to
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Date range</p>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'This week',    from: thisWeekFrom, to: thisWeekTo },
          { label: 'Next week',    from: nextWeekFrom, to: nextWeekTo },
          { label: 'Next 2 weeks', from: twoWeeksFrom, to: twoWeeksTo },
        ].map(({ label, from, to }) => (
          <button
            key={label}
            type="button"
            onClick={() => navigate(from, to)}
            className={[
              'text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
              isActive(from, to)
                ? 'bg-sage-500 border-sage-500 text-white'
                : 'border-stone-300 text-stone-700 hover:bg-stone-50',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-stone-500" htmlFor="grocery-date-from">From</label>
          <input
            id="grocery-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => navigate(e.target.value, dateTo)}
            className="text-xs border border-stone-200 rounded-lg px-2 py-1 text-stone-800 focus:outline-none focus:ring-2 focus:ring-sage-500"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-stone-500" htmlFor="grocery-date-to">To</label>
          <input
            id="grocery-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => navigate(dateFrom, e.target.value)}
            min={dateFrom}
            className="text-xs border border-stone-200 rounded-lg px-2 py-1 text-stone-800 focus:outline-none focus:ring-2 focus:ring-sage-500"
          />
        </div>
      </div>
    </div>
  )
}
