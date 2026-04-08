'use client'

import { formatDayName } from '@/lib/date-utils'

interface MealCardProps {
  id: string
  plannedDate: string
  recipeTitle: string
  mealType: string
  confirmed: boolean
  isSwapMode: boolean
  isSelected: boolean
  onTap: (entryId: string) => void
}

export default function MealCard({
  id,
  plannedDate,
  recipeTitle,
  mealType: _meal_type,
  confirmed,
  isSwapMode,
  isSelected,
  onTap,
}: MealCardProps) {
  const ringClass = isSelected
    ? 'ring-2 ring-sage-500'
    : isSwapMode
    ? 'ring-1 ring-stone-300'
    : ''

  return (
    <div
      className={`relative flex items-center justify-between rounded-lg border border-stone-200 px-4 py-3 bg-white ${ringClass} ${isSwapMode ? 'cursor-pointer' : ''}`}
      onClick={isSwapMode ? () => onTap(id) : undefined}
    >
      {isSelected && (
        <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-sage-500 text-white text-xs font-bold leading-none">
          ✓
        </span>
      )}
      <div>
        <p className="text-xs text-stone-500">{formatDayName(plannedDate)}</p>
        <p className="text-sm font-medium text-stone-900">{recipeTitle}</p>
      </div>
      {confirmed && !isSelected && (
        <span className="text-xs text-sage-500 font-medium">✓ Confirmed</span>
      )}
    </div>
  )
}
