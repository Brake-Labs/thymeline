'use client'

import type { MealType } from '@/types'

const MEAL_TYPE_LABELS: { type: MealType; label: string }[] = [
  { type: 'breakfast', label: 'Breakfast' },
  { type: 'lunch',     label: 'Lunch' },
  { type: 'dinner',    label: 'Dinner' },
  { type: 'snack',     label: 'Snacks' },
]

interface MealTypePickerProps {
  selected:  MealType[]
  onChange:  (selected: MealType[]) => void
}

export default function MealTypePicker({ selected, onChange }: MealTypePickerProps) {
  function toggle(mt: MealType) {
    if (selected.includes(mt)) {
      // Cannot deselect the last active pill
      if (selected.length === 1) return
      onChange(selected.filter((t) => t !== mt))
    } else {
      onChange([...selected, mt])
    }
  }

  const isLastActive = selected.length === 1

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {MEAL_TYPE_LABELS.map(({ type, label }) => {
          const active = selected.includes(type)
          const isLast = active && isLastActive
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggle(type)}
              disabled={isLast}
              aria-pressed={active}
              className={[
                'px-4 py-1.5 rounded-full text-sm font-medium border transition-colors',
                active
                  ? 'bg-sage-500 border-sage-500 text-white'
                  : 'bg-white border-stone-300 text-stone-600 hover:border-sage-400',
                isLast ? 'cursor-default opacity-80' : '',
              ].filter(Boolean).join(' ')}
            >
              {label}
            </button>
          )
        })}
      </div>
      {isLastActive && (
        <p className="text-xs text-stone-400">At least 1 meal type required</p>
      )}
    </div>
  )
}
