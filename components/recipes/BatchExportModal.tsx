'use client'

import { useState, useMemo } from 'react'
import type { RecipeListItem } from '@/types'
import { triggerDownload } from '@/lib/recipe-export'
import ExportProgress from './ExportProgress'

interface Props {
  recipes: RecipeListItem[]
  onClose: () => void
}

type ExportFormat = 'pdf' | 'json'

export default function BatchExportModal({ recipes, onClose }: Props) {
  const [tagFilter, setTagFilter] = useState('')
  const [titleSearch, setTitleSearch] = useState('')
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function handleExport() {
    if (filtered.length === 0) return
    setLoading(true)
    setError(null)

    try {
      if (format === 'pdf') {
        const ids = filtered.slice(0, 50).map((r) => r.id)
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
        const ids = filtered.map((r) => r.id)
        const idsParam = ids.join(',')
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
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-stone-800">Export Recipes</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-lg">&times;</button>
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Search by title..."
            value={titleSearch}
            onChange={(e) => setTitleSearch(e.target.value)}
            className="w-full border border-stone-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-400"
          />
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="w-full border border-stone-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-400 bg-white"
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <p className="text-sm text-stone-500">
          {filtered.length} recipe{filtered.length !== 1 ? 's' : ''} selected
          {format === 'pdf' && filtered.length > 50 && ' (first 50 will be exported)'}
        </p>

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
                disabled={filtered.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-sage-500 rounded-lg hover:bg-sage-600 disabled:opacity-40"
              >
                Export
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
