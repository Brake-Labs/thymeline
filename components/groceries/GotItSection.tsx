'use client'

import { useCallback, useState } from 'react'
import { GroceryItem } from '@/types'
import { TOAST_DURATION_MS } from '@/lib/constants'

interface GotItSectionProps {
  items:  GroceryItem[]
  onUndo: (itemId: string) => void
}

export default function GotItSection({ items, onUndo }: GotItSectionProps) {
  const [collapsed, setCollapsed] = useState(items.length > 3)
  const [showToast, setShowToast] = useState(false)

  const addToPantry = useCallback(async (toAdd: GroceryItem[]) => {
    await fetch('/api/pantry/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: toAdd.map((item) => ({
          name: item.name,
          quantity: [item.amount, item.unit].filter(Boolean).join(' ') || null,
          section: item.section ?? null,
        })),
      }),
    })
    setShowToast(true)
    setTimeout(() => setShowToast(false), TOAST_DURATION_MS)
  }, [])

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
                  onClick={() => addToPantry([item])}
                  aria-label={`Add ${item.name} to pantry`}
                  className="font-sans text-xs text-sage-500 hover:text-sage-700 transition-colors"
                >
                  + Pantry
                </button>
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

          <div className="flex justify-end py-2">
            <button
              type="button"
              onClick={() => addToPantry(items)}
              className="font-sans text-xs text-sage-600 hover:text-sage-800 font-medium transition-colors"
            >
              Add all to pantry
            </button>
          </div>
        </div>
      )}

      {showToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-xs px-4 py-2 rounded-full shadow-lg z-50">
          Added to pantry
        </div>
      )}
    </section>
  )
}
