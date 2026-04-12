'use client'

import { useState, useMemo, useEffect } from 'react'
import type { RecipeListItem } from '@/types'
import { triggerDownload } from '@/lib/recipe-export'
import ExportProgress from './ExportProgress'

interface Props {
  recipes: RecipeListItem[]
  onClose: () => void
}

type ExportFormat = 'pdf' | 'json'

function formatCategory(cat: string): string {
  return cat.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export default function BatchExportModal({ recipes, onClose }: Props) {
  const [tagFilter, setTagFilter] = useState('')
  const [titleSearch, setTitleSearch] = useState('')
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(recipes.map((r) => r.id)))

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const r of recipes) {
      for (const t of r.tags) set.add(t)
    }
    return Array.from(set).sort()
  }, [recipes])

  const filtered = useMemo(() => {
    return recipes.filter((r) => {
      if (tagFilter && !r.tags.includes(tagFilter)) return false
      if (titleSearch && !r.title.toLowerCase().includes(titleSearch.toLowerCase())) return false
      return true
    })
  }, [recipes, tagFilter, titleSearch])

  // Reset selection to all filtered recipes when filters change
  useEffect(() => {
    setSelectedIds(new Set(filtered.map((r) => r.id)))
  }, [filtered])

  // Selected count scoped to currently visible recipes
  const selectedCount = filtered.filter((r) => selectedIds.has(r.id)).length

  function toggleRecipe(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of filtered) next.add(r.id)
      return next
    })
  }

  function deselectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of filtered) next.delete(r.id)
      return next
    })
  }

  async function handleExport() {
    const exportIds = filtered.filter((r) => selectedIds.has(r.id)).map((r) => r.id)
    if (exportIds.length === 0) return
    setLoading(true)
    setError(null)

    try {
      if (format === 'pdf') {
        const ids = exportIds.slice(0, 200)
        const res = await fetch('/api/recipes/export/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipe_ids: ids, format: 'cookbook' }),
        })
        if (!res.ok) {
          setError("Couldn't generate PDF — please try again.")
          return
        }
        const blob = await res.blob()
        const filename = `thymeline-recipes-${new Date().toISOString().slice(0, 10)}.pdf`
        triggerDownload(blob, filename)
      } else {
        const idsParam = exportIds.join(',')
        const res = await fetch(`/api/recipes/export/json?ids=${encodeURIComponent(idsParam)}`)
        if (!res.ok) {
          setError("Couldn't generate export — please try again.")
          return
        }
        const blob = await res.blob()
        const filename = `thymeline-recipes-${new Date().toISOString().slice(0, 10)}.json`
        triggerDownload(blob, filename)
      }
      onClose()
    } catch {
      setError("Couldn't generate export — please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-stone-800">Export Recipes</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-lg">&times;</button>
        </div>

        {/* Filters row */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by title..."
            value={titleSearch}
            onChange={(e) => setTitleSearch(e.target.value)}
            className="flex-1 border border-stone-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-400"
          />
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="border border-stone-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-400 bg-white"
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Select controls */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-stone-500">
            {selectedCount} of {filtered.length} selected
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-sage-600 hover:text-sage-800 font-medium"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="text-xs text-stone-500 hover:text-stone-700 font-medium"
            >
              Deselect all
            </button>
          </div>
        </div>

        {/* Recipe checklist */}
        <div className="max-h-64 overflow-y-auto border border-stone-200 rounded-lg divide-y divide-stone-100">
          {filtered.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-6">No recipes match your filters</p>
          ) : (
            filtered.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-stone-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.id)}
                  onChange={() => toggleRecipe(r.id)}
                  className="rounded border-stone-300 text-sage-500 focus:ring-sage-400"
                />
                <span className="text-sm text-stone-700 flex-1 truncate">{r.title}</span>
                <span className="text-xs text-stone-400 shrink-0">{formatCategory(r.category)}</span>
              </label>
            ))
          )}
        </div>

        {/* Format picker */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setFormat('pdf')}
            className={`p-3 rounded-xl border text-sm font-medium transition-colors ${
              format === 'pdf'
                ? 'border-sage-500 bg-sage-50 text-sage-700'
                : 'border-stone-200 text-stone-600 hover:border-stone-300'
            }`}
          >
            PDF Cookbook
          </button>
          <button
            type="button"
            onClick={() => setFormat('json')}
            className={`p-3 rounded-xl border text-sm font-medium transition-colors ${
              format === 'json'
                ? 'border-sage-500 bg-sage-50 text-sage-700'
                : 'border-stone-200 text-stone-600 hover:border-stone-300'
            }`}
          >
            JSON Data
          </button>
        </div>

        {/* PDF limit note */}
        {format === 'pdf' && selectedCount > 200 && (
          <p className="text-sm text-amber-600">PDF export limited to 200 recipes</p>
        )}

        {/* Error */}
        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          {loading ? (
            <ExportProgress message={format === 'pdf' ? 'Generating your cookbook...' : 'Preparing export...'} />
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={selectedCount === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-sage-500 rounded-lg hover:bg-sage-600 disabled:opacity-40"
              >
                Export{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
