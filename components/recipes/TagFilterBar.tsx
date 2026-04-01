'use client'

import { STYLE_TAGS, DIETARY_TAGS, SEASONAL_TAGS, CUISINE_TAGS, PROTEIN_TAGS } from '@/lib/tags'

interface TagFilterBarProps {
  tags:          string[]
  activeFilters: string[]
  onChange:      (filters: string[]) => void
}

const STYLE_SET    = new Set<string>(STYLE_TAGS)
const DIETARY_SET  = new Set<string>(DIETARY_TAGS)
const SEASONAL_SET = new Set<string>(SEASONAL_TAGS)
const CUISINE_SET  = new Set<string>(CUISINE_TAGS)
const PROTEIN_SET  = new Set<string>(PROTEIN_TAGS)

function groupTags(tags: string[]): { label: string; tags: string[] }[] {
  const style:    string[] = []
  const dietary:  string[] = []
  const seasonal: string[] = []
  const cuisine:  string[] = []
  const protein:  string[] = []
  const custom:   string[] = []

  for (const tag of tags) {
    if (STYLE_SET.has(tag))         style.push(tag)
    else if (DIETARY_SET.has(tag))  dietary.push(tag)
    else if (SEASONAL_SET.has(tag)) seasonal.push(tag)
    else if (CUISINE_SET.has(tag))  cuisine.push(tag)
    else if (PROTEIN_SET.has(tag))  protein.push(tag)
    else custom.push(tag)
  }

  const groups: { label: string; tags: string[] }[] = []
  if (style.length)    groups.push({ label: 'Style',    tags: style })
  if (dietary.length)  groups.push({ label: 'Dietary',  tags: dietary })
  if (seasonal.length) groups.push({ label: 'Seasonal', tags: seasonal })
  if (cuisine.length)  groups.push({ label: 'Cuisine',  tags: cuisine })
  if (protein.length)  groups.push({ label: 'Protein',  tags: protein })
  if (custom.length)   groups.push({ label: 'Your tags', tags: custom })
  return groups
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

  const groups = groupTags(tags)

  return (
    <div className="space-y-2">
      {activeFilters.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-stone-500 hover:text-stone-800 border border-stone-200 rounded-full px-2.5 py-1 bg-white transition-colors"
        >
          Clear
        </button>
      )}
      {groups.map(({ label, tags: groupTags }) => (
        <div key={label}>
          <p className="text-xs text-stone-400 mb-1">{label}</p>
          <div className="flex flex-wrap gap-1.5">
            {groupTags.map((tag) => {
              const active = activeFilters.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag)}
                  className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
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
        </div>
      ))}
    </div>
  )
}
