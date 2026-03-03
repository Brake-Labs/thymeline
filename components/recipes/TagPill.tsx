'use client'

interface TagPillProps {
  label: string
  onRemove?: () => void
}

export default function TagPill({ label, onRemove }: TagPillProps) {
  return (
    <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 rounded-full text-xs px-2 py-0.5">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 hover:text-gray-900 focus:outline-none"
          aria-label={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </span>
  )
}
