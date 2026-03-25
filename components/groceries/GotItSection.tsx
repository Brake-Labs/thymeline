'use client'

import { useState } from 'react'
import { GroceryItem } from '@/types'

interface GotItSectionProps {
  items:  GroceryItem[]
  onUndo: (itemId: string) => void
}

export default function GotItSection({ items, onUndo }: GotItSectionProps) {
  const [collapsed, setCollapsed] = useState(items.length > 3)

  if (items.length === 0) return null

  return (
    <section aria-label="Got it" className="border border-stone-200 rounded-xl bg-stone-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 pt-4 pb-3 border-b border-stone-100"
        aria-expanded={!collapsed}
      >
        <h3 className="font-display font-semibold text-sage-600 text-sm">
          Got it ({items.length})
        </h3>
        <span className="text-xs text-stone-400">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className="px-4 py-2 divide-y divide-stone-100">
          {items.map((item) => {
            const label = [
              item.amount !== null ? item.amount : null,
              item.unit ?? null,
              item.name,
            ].filter(Boolean).join(' ')

            return (
              <div key={item.id} className="flex items-center gap-3 py-2">
                <span className="flex-1 text-sm line-through text-stone-400">{label}</span>
                <button
                  type="button"
                  onClick={() => onUndo(item.id)}
                  aria-label={`Undo ${item.name}`}
                  className="font-sans text-xs text-stone-400 hover:text-stone-700 transition-colors"
                >
                  ↩ Undo
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
