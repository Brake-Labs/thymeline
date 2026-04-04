'use client'

import { GroceryItem } from '@/types'

interface GroceryItemRowProps {
  item:      GroceryItem
  onToggle:  () => void
  onRemove:  () => void
  onGotIt?:  () => void
}

export default function GroceryItemRow({ item, onToggle, onRemove, onGotIt }: GroceryItemRowProps) {
  const label = [
    item.amount !== null ? item.amount : null,
    item.unit ?? null,
    item.name,
  ].filter(Boolean).join(' ')

  return (
    <div className="group flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.checked ? `Uncheck ${item.name}` : `Check ${item.name}`}
        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          item.checked
            ? 'bg-sage-500 border-sage-500'
            : 'border-stone-300 hover:border-stone-400'
        }`}
      >
        {item.checked && (
          <svg className="w-3 h-3 text-white" viewBox="0 0 12 10" fill="none">
            <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <span
        className={`flex-1 text-sm ${
          item.checked
            ? 'line-through text-stone-400'
            : item.is_pantry
            ? 'text-stone-400'
            : 'text-stone-800'
        }`}
      >
        {label}
        {item.is_pantry && !item.checked && (
          <span className="ml-1 text-xs text-stone-400">(optional)</span>
        )}
      </span>

      {onGotIt && (
        <button
          type="button"
          onClick={onGotIt}
          aria-label={`Got it ${item.name}`}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 font-sans text-[11px] text-sage-600 hover:text-sage-800 transition-opacity"
        >
          ✓ Got it
        </button>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.name}`}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-stone-400 hover:text-red-500 transition-opacity text-lg leading-none"
      >
        ×
      </button>
    </div>
  )
}
