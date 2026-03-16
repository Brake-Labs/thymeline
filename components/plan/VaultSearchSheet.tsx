'use client'

import { useEffect, useState } from 'react'
import { getAccessToken } from '@/lib/supabase/browser'
import type { DaySelection } from '@/types'

interface VaultRecipe {
  id: string
  title: string
  tags: string[]
  category: string
}

interface VaultSearchSheetProps {
  forDate: string
  onAssign: (recipe: DaySelection) => void
  onClose: () => void
}

function formatCategory(cat: string): string {
  return cat.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export default function VaultSearchSheet({ forDate, onAssign, onClose }: VaultSearchSheetProps) {
  const [recipes, setRecipes] = useState<VaultRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  useEffect(() => {
    async function loadRecipes() {
      const token = await getAccessToken()
      const res = await fetch('/api/recipes', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setRecipes(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    }
    loadRecipes()
  }, [])

  const allTags = Array.from(new Set(recipes.flatMap((r) => r.tags))).sort()
  const allCategories = Array.from(new Set(recipes.map((r) => r.category))).sort()

  const filtered = recipes.filter((r) => {
    const q = query.toLowerCase()
    if (q && !r.title.toLowerCase().includes(q)) return false
    if (tagFilter && !r.tags.includes(tagFilter)) return false
    if (categoryFilter && r.category !== categoryFilter) return false
    return true
  })

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />

      {/* Sheet / Modal */}
      <div
        role="dialog"
        aria-label="Search your recipe vault"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl max-h-[80vh] flex flex-col md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg md:rounded-2xl md:max-h-[70vh] shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-stone-100">
          <h2 className="text-base font-semibold text-stone-800">Pick from your vault</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-full hover:bg-stone-100 text-stone-500 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 space-y-2 border-b border-stone-100">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex gap-2">
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="flex-1 border border-stone-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="">All tags</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="flex-1 border border-stone-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="">All categories</option>
              {allCategories.map((c) => <option key={c} value={c}>{formatCategory(c)}</option>)}
            </select>
          </div>
        </div>

        {/* Recipe list */}
        <div className="overflow-y-auto flex-1 px-4 py-2">
          {loading && <p className="text-sm text-stone-400 py-4 text-center">Loading…</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-stone-400 py-4 text-center">No recipes found</p>
          )}
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onAssign({ date: forDate, recipe_id: r.id, recipe_title: r.title, from_vault: true })
                onClose()
              }}
              className="w-full text-left py-3 border-b border-stone-50 last:border-0 hover:bg-stone-50 rounded-lg px-2 transition-colors"
            >
              <p className="text-sm font-medium text-stone-800">{r.title}</p>
              {r.tags.length > 0 && (
                <p className="text-xs text-stone-400 mt-0.5">{r.tags.join(' · ')}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
