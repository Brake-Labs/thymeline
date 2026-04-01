'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ImportResult } from '@/types'
import DuplicateActions from './DuplicateActions'

interface Props {
  results:  ImportResult[]
  onChange: (updated: ImportResult[]) => void
  onSave:   (selected: ImportResult[]) => void
  isSaving: boolean
}

type StatusBadge = {
  label: string
  className: string
}

function getStatusBadge(r: ImportResult): StatusBadge {
  if (r.status === 'failed')  return { label: 'Failed',    className: 'bg-red-100 text-red-700' }
  if (r.status === 'partial') return { label: 'Partial',   className: 'bg-yellow-100 text-yellow-700' }
  if (r.duplicate)            return { label: 'Duplicate', className: 'bg-amber-100 text-amber-700' }
  return { label: 'Ready', className: 'bg-green-100 text-green-700' }
}

export default function ReviewTable({ results, onChange, onSave, isSaving }: Props) {
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(results.filter((r) => r.status !== 'failed').map((r) => r.id)),
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function selectAllReady() {
    setChecked(new Set(results.filter((r) => r.status === 'ready' && !r.duplicate).map((r) => r.id)))
  }

  function deselectDuplicates() {
    setChecked((prev) => {
      const next = new Set(prev)
      results.filter((r) => r.duplicate).forEach((r) => next.delete(r.id))
      return next
    })
  }

  function deselectFailed() {
    setChecked((prev) => {
      const next = new Set(prev)
      results.filter((r) => r.status === 'failed').forEach((r) => next.delete(r.id))
      return next
    })
  }

  function startEdit(r: ImportResult) {
    setEditingId(r.id)
    setEditValue(r.recipe?.title ?? '')
  }

  function commitEdit(id: string) {
    setEditingId(null)
    const updated = results.map((r) => {
      if (r.id !== id || !r.recipe) return r
      return { ...r, recipe: { ...r.recipe, title: editValue } }
    })
    onChange(updated)
  }

  function updateDuplicateAction(id: string, action: 'skip' | 'keep_both' | 'replace') {
    const updated = results.map((r) => r.id === id ? { ...r, duplicate_action: action } : r)
    onChange(updated)
    if (action === 'skip') {
      setChecked((prev) => { const next = new Set(prev); next.delete(id); return next })
    } else {
      setChecked((prev) => new Set([...prev, id]))
    }
  }

  const selectedResults = results.filter((r) => checked.has(r.id))
  const n = selectedResults.length

  return (
    <div className="space-y-4">
      {/* Bulk actions */}
      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" onClick={selectAllReady}
          className="px-3 py-1 rounded border border-stone-300 text-stone-600 hover:border-sage-400 hover:text-sage-700 transition-colors">
          Select all ready
        </button>
        <button type="button" onClick={deselectDuplicates}
          className="px-3 py-1 rounded border border-stone-300 text-stone-600 hover:border-sage-400 hover:text-sage-700 transition-colors">
          Deselect duplicates
        </button>
        <button type="button" onClick={deselectFailed}
          className="px-3 py-1 rounded border border-stone-300 text-stone-600 hover:border-sage-400 hover:text-sage-700 transition-colors">
          Deselect failed
        </button>
      </div>

      {/* Table */}
      <div className="border border-stone-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="text-left px-3 py-2 font-medium text-stone-600">Title</th>
              <th className="text-left px-3 py-2 font-medium text-stone-600">Source</th>
              <th className="text-left px-3 py-2 font-medium text-stone-600">Status</th>
              <th className="text-left px-3 py-2 font-medium text-stone-600">Tags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {results.map((r) => {
              const badge = getStatusBadge(r)
              return (
                <tr key={r.id} className={checked.has(r.id) ? 'bg-sage-50' : ''}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked.has(r.id)}
                      disabled={r.status === 'failed'}
                      onChange={() => toggle(r.id)}
                      className="rounded border-stone-300 text-sage-500 focus:ring-sage-400"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {editingId === r.id ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => commitEdit(r.id)}
                        onKeyDown={(e) => e.key === 'Enter' && commitEdit(r.id)}
                        className="border border-sage-400 rounded px-2 py-0.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-sage-400"
                      />
                    ) : (
                      <div>
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="text-stone-800 font-medium hover:text-sage-700 text-left"
                        >
                          {r.recipe?.title ?? '(untitled)'}
                        </button>
                        {r.duplicate && (
                          <p className="text-xs text-stone-400 mt-0.5">
                            Similar to: {r.duplicate.recipe_title}
                          </p>
                        )}
                        {r.duplicate && (
                          <DuplicateActions
                            result={r}
                            onChange={(action) => updateDuplicateAction(r.id, action)}
                          />
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-stone-500 text-xs">
                    {r.source_label}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                    {r.error && (
                      <p className="text-xs text-red-500 mt-0.5">{r.error}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(r.recipe?.tags ?? []).slice(0, 3).map((tag) => (
                        <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                          {tag}
                        </span>
                      ))}
                      {(r.recipe?.tags?.length ?? 0) > 3 && (
                        <span className="text-xs text-stone-400">+{(r.recipe?.tags?.length ?? 0) - 3}</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          disabled={n === 0 || isSaving}
          onClick={() => onSave(selectedResults)}
          className="px-5 py-2 bg-sage-500 text-white rounded-lg text-sm font-medium hover:bg-sage-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Importing…' : `Import ${n} recipe${n !== 1 ? 's' : ''}`}
        </button>
        <Link
          href="/recipes"
          className="px-4 py-2 text-sm text-stone-500 hover:text-stone-700 border border-stone-300 rounded-lg transition-colors"
        >
          Cancel
        </Link>
      </div>
    </div>
  )
}
