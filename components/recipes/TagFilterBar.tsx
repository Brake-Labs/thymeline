'use client'

interface TagFilterBarProps {
  tags:          string[]
  activeFilters: string[]
  onChange:      (filters: string[]) => void
}

export default function TagFilterBar({ tags, activeFilters, onChange }: TagFilterBarProps) {
  if (tags.length === 0) return null

  function toggle(tag: string) {
    if (activeFilters.includes(tag)) {
      onChange(activeFilters.filter((t) => t !== tag))
    } else {
      onChange([...activeFilters, tag])
    }
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {activeFilters.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="shrink-0 text-xs text-stone-500 hover:text-stone-800 border border-stone-200 rounded-full px-2.5 py-1 bg-white transition-colors"
        >
          Clear
        </button>
      )}
      {tags.map((tag) => {
        const active = activeFilters.includes(tag)
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={`shrink-0 text-xs rounded-full px-2.5 py-1 border transition-colors ${
              active
                ? 'bg-stone-800 text-white border-stone-800'
                : 'border-stone-300 text-stone-600 bg-white hover:bg-stone-50'
            }`}
          >
            {tag}
          </button>
        )
      })}
    </div>
  )
}
