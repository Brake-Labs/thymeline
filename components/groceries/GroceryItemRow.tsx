'use client'

import { useState } from 'react'
import { GroceryItem } from '@/types'

interface GroceryItemRowProps {
  item:      GroceryItem
  /**
   * 'need' (default): check means "I already have this" → strikethrough
   * 'pantry': check means "I need to pick this up" → terra highlight, no strikethrough
   */
  mode?:     'need' | 'pantry'
  onToggle:  () => void
  onRemove:  () => void
  onGotIt?:  () => void
  onEdit?:   (itemId: string, updates: { name: string; amount: number | null; unit: string | null }) => void
}

function RecipeBreakdown({ item }: { item: GroceryItem }) {
  const [expanded, setExpanded] = useState(false)
  const breakdown = item.recipeBreakdown
  if (!breakdown || breakdown.length <= 1) return null

  return (
    <div className="ml-8">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
      >
        {expanded ? '▾' : '▸'} {breakdown.length} recipes
      </button>
      {expanded && (
        <div className="mt-0.5 space-y-0.5">
          {breakdown.map((entry, i) => {
            const amt = entry.amount !== null ? `${entry.amount}` : ''
            const unit = entry.unit ? ` ${entry.unit}` : ''
            return (
              <div key={i} className="text-xs text-stone-500">
                └ {entry.recipe}{amt ? ` — ${amt}${unit}` : ''}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function GroceryItemRow({ item, mode = 'need', onToggle, onRemove, onGotIt, onEdit }: GroceryItemRowProps) {
  const [editing,    setEditing   ] = useState(false)
  const [editName,   setEditName  ] = useState(item.name)
  const [editAmount, setEditAmount] = useState(item.amount !== null ? String(item.amount) : '')
  const [editUnit,   setEditUnit  ] = useState(item.unit ?? '')

  const isPantryUnchecked = item.isPantry && !item.checked

  function handleSave() {
    if (!onEdit) return
    const parsed = parseFloat(editAmount)
    onEdit(item.id, {
      name:   editName.trim() || item.name,
      amount: editAmount.trim() !== '' && !isNaN(parsed) ? parsed : null,
      unit:   editUnit.trim() || null,
    })
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') setEditing(false)
  }

  const label = [
    item.amount !== null ? item.amount : null,
    item.unit ?? null,
    item.name,
  ].filter(Boolean).join(' ')

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2">
        <input
          type="text"
          value={editAmount}
          onChange={(e) => setEditAmount(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="qty"
          className="w-14 text-sm border border-stone-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-sage-400"
        />
        <input
          type="text"
          value={editUnit}
          onChange={(e) => setEditUnit(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="unit"
          className="w-16 text-sm border border-stone-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-sage-400"
        />
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="name"
          className="flex-1 text-sm border border-stone-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-sage-400"
          autoFocus
        />
        <button
          type="button"
          onClick={handleSave}
          className="text-xs text-sage-600 hover:text-sage-800 font-medium"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs text-stone-400 hover:text-stone-600"
        >
          ✕
        </button>
      </div>
    )
  }

  // ── Pantry mode: check = "need to buy" (terra highlight) ─────────────────────
  if (mode === 'pantry') {
    return (
      <>
        <div className="group flex items-center gap-3 py-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label={item.checked ? `Uncheck ${item.name}` : `Check ${item.name}`}
            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              item.checked
                ? 'bg-terra-500 border-terra-500'
                : 'border-stone-300 hover:border-stone-400'
            }`}
          >
            {item.checked && (
              <svg className="w-3 h-3 text-white" viewBox="0 0 12 10" fill="none">
                <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          <span className={`flex-1 text-sm ${item.checked ? 'text-terra-700 font-medium' : 'text-stone-400'}`}>
            {label}
            {isPantryUnchecked && (
              <span className="ml-1 text-xs text-stone-400">(in pantry)</span>
            )}
          </span>

          {onEdit && !editing && (
            <button
              type="button"
              onClick={() => {
                setEditName(item.name)
                setEditAmount(item.amount !== null ? String(item.amount) : '')
                setEditUnit(item.unit ?? '')
                setEditing(true)
              }}
              aria-label={`Edit ${item.name}`}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 font-sans text-[11px] text-stone-400 hover:text-stone-600 transition-opacity"
            >
              Edit
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
        <RecipeBreakdown item={item} />
      </>
    )
  }

  // ── Need mode (default): check = "I have this" → strikethrough ───────────────
  return (
    <>
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
              : item.isPantry
              ? 'text-stone-400'
              : 'text-stone-800'
          }`}
        >
          {label}
          {isPantryUnchecked && (
            <span className="ml-1 text-xs text-stone-400">(in pantry)</span>
          )}
        </span>

        {onEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setEditName(item.name)
              setEditAmount(item.amount !== null ? String(item.amount) : '')
              setEditUnit(item.unit ?? '')
              setEditing(true)
            }}
            aria-label={`Edit ${item.name}`}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 font-sans text-[11px] text-stone-400 hover:text-stone-600 transition-opacity"
          >
            Edit
          </button>
        )}

        {onGotIt && !item.isPantry && !editing && (
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
      <RecipeBreakdown item={item} />
    </>
  )
}
