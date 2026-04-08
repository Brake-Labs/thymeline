'use client'

import type { ImportResult } from '@/types'

interface Props {
  result:   ImportResult
  onChange: (action: 'skip' | 'keep_both' | 'replace') => void
}

const ACTIONS = [
  { value: 'skip'      as const, label: 'Skip' },
  { value: 'keep_both' as const, label: 'Keep both' },
  { value: 'replace'   as const, label: 'Replace' },
]

export default function DuplicateActions({ result, onChange }: Props) {
  const current = result.duplicateAction ?? 'keep_both'

  return (
    <div className="mt-1 space-y-1">
      <div className="flex gap-1">
        {ACTIONS.map((action) => (
          <button
            key={action.value}
            type="button"
            onClick={() => onChange(action.value)}
            className={`px-2.5 py-0.5 rounded text-xs font-medium border transition-colors ${
              current === action.value
                ? 'bg-sage-500 text-white border-sage-500'
                : 'bg-white text-stone-600 border-stone-300 hover:border-sage-400 hover:text-sage-700'
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
      {current === 'replace' && result.duplicate && (
        <p className="text-xs text-amber-600">
          Will replace: {result.duplicate.recipeTitle}
        </p>
      )}
    </div>
  )
}
