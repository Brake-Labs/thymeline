'use client'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface DayTogglePickerProps {
  activeDates: string[]
  weekStart: string
  onChange: (activeDates: string[]) => void
}

function getWeekDates(weekStart: string): string[] {
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T12:00:00Z')
    d.setDate(d.getDate() + i)
    dates.push(d.toISOString().split('T')[0]!)
  }
  return dates
}

export default function DayTogglePicker({ activeDates, weekStart, onChange }: DayTogglePickerProps) {
  const weekDates = getWeekDates(weekStart)
  const isOnlyActive = activeDates.length === 1

  const toggle = (date: string) => {
    if (activeDates.includes(date)) {
      if (isOnlyActive) return // cannot deactivate last day
      onChange(activeDates.filter((d) => d !== date))
    } else {
      onChange([...activeDates, date].sort())
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5 flex-wrap">
        {weekDates.map((date, i) => {
          const isActive = activeDates.includes(date)
          const isLastAndActive = isOnlyActive && isActive
          return (
            <button
              key={date}
              onClick={() => toggle(date)}
              aria-pressed={isActive}
              className={[
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors select-none',
                isActive
                  ? 'bg-sage-500 text-white'
                  : 'bg-stone-100 text-stone-500',
                isLastAndActive ? 'cursor-default' : 'cursor-pointer hover:opacity-80',
              ].join(' ')}
            >
              {DAY_LABELS[i]}
            </button>
          )
        })}
      </div>
      {isOnlyActive && (
        <p className="text-xs text-stone-400">At least 1 day required</p>
      )}
    </div>
  )
}
