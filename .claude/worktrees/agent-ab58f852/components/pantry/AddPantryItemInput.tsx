'use client'

import { useState } from 'react'
import type { PantryItem, GrocerySection } from '@/types'
import { getAccessToken } from '@/lib/supabase/browser'

const SECTIONS: GrocerySection[] = [
  'Produce', 'Proteins', 'Dairy & Eggs', 'Pantry',
  'Canned & Jarred', 'Bakery', 'Frozen', 'Other',
]

interface AddPantryItemInputProps {
  onAdd: (item: PantryItem) => void
}

export default function AddPantryItemInput({ onAdd }: AddPantryItemInputProps) {
  const [name, setName] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [section, setSection] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Item name is required')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const token = await getAccessToken()
      const body: Record<string, string> = { name: name.trim() }
      if (expiryDate) body.expiry_date = expiryDate
      if (section) body.section = section

      const res = await fetch('/api/pantry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? 'Failed to add item')
        return
      }
      const json = await res.json()
      onAdd(json.item as PantryItem)
      setName('')
      setExpiryDate('')
      setSection('')
    } catch {
      setError('Failed to add item')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-3 border border-stone-200 rounded-xl bg-stone-50">
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null) }}
          placeholder="e.g. 2 cans diced tomatoes"
          className="flex-1 border border-stone-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sage-400"
          aria-label="Item name"
        />
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 text-sm rounded-lg bg-sage-500 text-white hover:bg-sage-600 disabled:opacity-50 font-medium"
        >
          {submitting ? 'Adding…' : 'Add'}
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          className="border border-stone-200 rounded px-2 py-1 text-xs text-stone-600 focus:outline-none focus:ring-1 focus:ring-sage-400"
          aria-label="Expiry date"
        />
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="border border-stone-200 rounded px-2 py-1 text-xs text-stone-600 focus:outline-none focus:ring-1 focus:ring-sage-400"
          aria-label="Section"
        >
          <option value="">Auto-detect section</option>
          {SECTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </form>
  )
}
