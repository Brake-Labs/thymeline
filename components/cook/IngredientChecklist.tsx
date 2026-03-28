'use client'

import { scaleIngredients } from '@/lib/scale-ingredients'

interface Props {
  ingredients: string
  baseServings: number
  targetServings: number
  checked: Set<number>
  onToggle: (index: number) => void
  onCheckAll: () => void
  onUncheckAll: () => void
}

export default function IngredientChecklist({
  ingredients,
  baseServings,
  targetServings,
  checked,
  onToggle,
  onCheckAll,
  onUncheckAll,
}: Props) {
  const lines = scaleIngredients(ingredients, baseServings, targetServings)
  const allChecked = lines.length > 0 && checked.size === lines.length

  return (
    <div className="px-4 py-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-semibold text-stone-700 text-sm">Ingredients</h2>
        <button
          type="button"
          onClick={allChecked ? onUncheckAll : onCheckAll}
          className="text-xs text-sage-600 hover:underline"
        >
          {allChecked ? 'Uncheck all' : 'Check all'}
        </button>
      </div>
      <ul className="space-y-1">
        {lines.map((line, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onToggle(i)}
              className={`w-full flex items-start gap-3 py-2 px-3 rounded text-left text-sm transition-colors ${
                checked.has(i) ? 'bg-stone-50' : 'hover:bg-stone-50'
              }`}
            >
              <span
                className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                  checked.has(i)
                    ? 'bg-sage-500 border-sage-500 text-white'
                    : 'border-stone-300'
                }`}
              >
                {checked.has(i) && '✓'}
              </span>
              <span className={checked.has(i) ? 'line-through text-stone-400' : 'text-stone-700'}>
                {line}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
