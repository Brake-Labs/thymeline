'use client'

import { useState } from 'react'
import type { PantryItem } from '@/types'
import ExpiryBadge from './ExpiryBadge'

interface PantryItemRowProps {
  item:     PantryItem
  onEdit:   (item: PantryItem) => void
  onDelete: (id: string) => void
}

export default function PantryItemRow({ item, onEdit, onDelete }: PantryItemRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [quantity, setQuantity] = useState(item.quantity ?? '')
  const [expiryDate, setExpiryDate] = useState(item.expiry_date ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const { getAccessToken } = await import('@/lib/supabase/browser')
      const token = await getAccessToken()
      const res = await fetch(`/api/pantry/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          quantity:    quantity || null,
          expiry_date: expiryDate || null,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        onEdit(json.item as PantryItem)
        setExpanded(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="py-2">
      <div
        className="group flex items-center gap-2 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="flex-1 text-sm font-medium text-stone-800">{item.name}</span>
        {item.quantity && (
          <span className="text-xs text-stone-400">{item.quantity}</span>
        )}
        <ExpiryBadge expiry_date={item.expiry_date} />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
          aria-label={`Delete ${item.name}`}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-stone-300 hover:text-red-500 text-xs px-1"
        >
          ×
        </button>
      </div>

      {expanded && (
        <div className="mt-2 ml-2 flex flex-col gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-stone-500">Quantity</span>
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="border border-stone-200 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-sage-400"
              placeholder="e.g. 2 cans"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-stone-500">Expiry date</span>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="bg-[#FFFDF9] border border-stone-200 rounded-[4px] px-2 py-1.5 font-sans text-[13px] text-sage-900 w-full accent-[#4A7C59] focus:outline-none focus:ring-2 focus:ring-sage-500"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 text-xs rounded bg-sage-500 text-white hover:bg-sage-600 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="px-3 py-1 text-xs rounded border border-stone-200 text-stone-500 hover:text-stone-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
