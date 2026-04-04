'use client'

import { useEffect, useState, useCallback } from 'react'
import type { PantryItem, GrocerySection, PantryMatch } from '@/types'
import { getAccessToken } from '@/lib/supabase/browser'
import { expiryStatus } from './pantryUtils'
import PantrySection from './PantrySection'
import AddPantryItemInput from './AddPantryItemInput'
import ScanPantrySheet from './ScanPantrySheet'
import PantryMatchSheet from './PantryMatchSheet'
import GenerateRecipeModal from '@/components/recipes/GenerateRecipeModal'

// Section render order (spec §6 rule 9)
const SECTION_ORDER: (GrocerySection | 'Unsorted')[] = [
  'Produce', 'Proteins', 'Dairy & Eggs', 'Pantry',
  'Canned & Jarred', 'Bakery', 'Frozen', 'Other', 'Unsorted',
]

export default function PantryPageClient() {
  const [items, setItems] = useState<PantryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [matchLoading, setMatchLoading] = useState(false)
  const [matches, setMatches] = useState<PantryMatch[] | null>(null)
  const [showGenerateModal, setShowGenerateModal] = useState(false)

  const fetchItems = useCallback(async () => {
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/pantry', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const json = await res.json()
        setItems(json.items as PantryItem[])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Filter by search
  const filtered = search
    ? items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : items

  // Group by section
  const grouped = new Map<string, PantryItem[]>()
  for (const item of filtered) {
    const key = item.section ?? 'Unsorted'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(item)
  }

  const expiredIds = items
    .filter((i) => expiryStatus(i.expiry_date) === 'expired')
    .map((i) => i.id)

  async function handleDelete(id: string) {
    // Optimistic
    setItems((prev) => prev.filter((i) => i.id !== id))
    const token = await getAccessToken()
    await fetch(`/api/pantry/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  }

  function handleEdit(updated: PantryItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  function handleAdd(item: PantryItem) {
    setItems((prev) => [...prev, item])
    setShowAdd(false)
  }

  async function handleClearExpired() {
    if (expiredIds.length === 0) return
    const token = await getAccessToken()
    // Optimistic
    setItems((prev) => prev.filter((i) => !expiredIds.includes(i.id)))
    await fetch('/api/pantry', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ids: expiredIds }),
    })
  }

  async function handleClearAll() {
    const allIds = items.map((i) => i.id)
    if (allIds.length === 0) { setShowClearConfirm(false); return }
    const token = await getAccessToken()
    setItems([])
    setShowClearConfirm(false)
    await fetch('/api/pantry', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ids: allIds }),
    })
  }

  async function handleWhatCanIMake() {
    setMatchLoading(true)
    setMatches([])
    const token = await getAccessToken()
    try {
      const res = await fetch('/api/pantry/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.ok) {
        const json = await res.json()
        setMatches(json.matches as PantryMatch[])
      } else {
        setMatches([])
      }
    } catch {
      setMatches([])
    } finally {
      setMatchLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-sage-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-bold text-stone-800">Pantry</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowScan(true)}
            className="px-3 py-1.5 text-sm rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors"
          >
            📷 Scan
          </button>
          <button
            type="button"
            onClick={() => setShowGenerateModal(true)}
            className="px-3 py-1.5 text-sm rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Generate new recipe
          </button>
          <button
            type="button"
            onClick={handleWhatCanIMake}
            className="px-3 py-1.5 text-sm rounded-lg bg-sage-500 text-white hover:bg-sage-600 transition-colors font-medium"
          >
            What can I make?
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search pantry…"
        className="w-full mb-4 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sage-400"
      />

      {/* Add item */}
      <div className="mb-4">
        {showAdd ? (
          <AddPantryItemInput onAdd={handleAdd} />
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="w-full py-2 rounded-xl border border-dashed border-stone-300 text-stone-500 text-sm hover:border-sage-400 hover:text-sage-600 transition-colors"
          >
            + Add item
          </button>
        )}
      </div>

      {/* Action buttons */}
      {expiredIds.length > 0 && (
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={handleClearExpired}
            className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
          >
            Clear {expiredIds.length} expired item{expiredIds.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* Sections */}
      {items.length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-8">
          Your pantry is empty. Add items above or scan your fridge.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-8">No items match &ldquo;{search}&rdquo;</p>
      ) : (
        SECTION_ORDER.filter((s) => grouped.has(s)).map((sectionKey) => (
          <PantrySection
            key={sectionKey}
            section={sectionKey}
            items={grouped.get(sectionKey)!}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))
      )}

      {/* Clear all */}
      {items.length > 0 && (
        <div className="mt-6 flex justify-center">
          {showClearConfirm ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-stone-500">Clear all {items.length} items?</span>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-red-500 font-medium hover:text-red-700"
              >
                Yes, clear
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Scan sheet */}
      {showScan && (
        <ScanPantrySheet
          onImport={(refreshedItems) => setItems(refreshedItems)}
          onClose={() => setShowScan(false)}
        />
      )}

      {/* Match sheet */}
      {(matchLoading || matches !== null) && (
        <PantryMatchSheet
          matches={matches ?? []}
          loading={matchLoading}
          onClose={() => setMatches(null)}
        />
      )}

      {/* Generate recipe modal (spec-13) */}
      {showGenerateModal && (
        <GenerateRecipeModal
          onClose={() => setShowGenerateModal(false)}
          onSaved={() => {
            setShowGenerateModal(false)
            window.location.href = '/recipes'
          }}
          getToken={getAccessToken}
          initialPantryEnabled={true}
        />
      )}
    </div>
  )
}
