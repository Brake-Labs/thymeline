'use client'

interface BulkActionBarProps {
  count: number
  onAddTags: () => void
  onDelete: () => void
  onCancel: () => void
}

export default function BulkActionBar({ count, onAddTags, onDelete, onCancel }: BulkActionBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#1F2D26] text-white text-sm">
      <span className="font-medium">
        {count} recipe{count !== 1 ? 's' : ''} selected
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onAddTags}
          className="px-3 py-1.5 rounded border border-sage-400 text-sage-200 hover:bg-sage-800 text-xs font-medium transition-colors"
        >
          + Add tags
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="px-3 py-1.5 rounded border border-terra-400 text-terra-200 hover:bg-terra-900 text-xs font-medium transition-colors"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded border border-stone-500 text-stone-300 hover:bg-stone-700 text-xs font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
