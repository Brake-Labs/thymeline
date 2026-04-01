'use client'

import { useState } from 'react'
import TagSelector from './TagSelector'

interface BulkTagModalProps {
  selectedCount: number
  onConfirm: (tags: string[]) => Promise<void>
  onClose: () => void
}

export default function BulkTagModal({ selectedCount, onConfirm, onClose }: BulkTagModalProps) {
  const [chosenTags, setChosenTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    if (chosenTags.length === 0) return
    setLoading(true)
    setError(null)
    try {
      await onConfirm(chosenTags)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-display text-base font-semibold text-sage-900">
            Add tags to {selectedCount} recipe{selectedCount !== 1 ? 's' : ''}
          </h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          <p className="text-sm text-stone-500 mb-4">
            Select tags to add. Existing tags on selected recipes will be preserved.
          </p>
          <TagSelector selected={chosenTags} onChange={setChosenTags} />
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={chosenTags.length === 0 || loading}
            className="px-4 py-2 rounded text-sm font-medium bg-sage-500 text-white hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving…' : `Add ${chosenTags.length} tag${chosenTags.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
