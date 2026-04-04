'use client'

interface TagPillProps {
  label: string
  onRemove?: () => void
}

export default function TagPill({ label, onRemove }: TagPillProps) {
  return (
    <span className="inline-flex items-center gap-1 bg-sage-100 text-sage-700 border border-sage-200 rounded-full font-sans text-[12px] px-3 py-1">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 hover:text-sage-900 focus:outline-none"
          aria-label={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </span>
  )
}
