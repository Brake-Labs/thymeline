'use client'

import { STYLE_TAGS, DIETARY_TAGS, SEASONAL_TAGS, CUISINE_TAGS, PROTEIN_TAGS } from '@/lib/tags'
import { LimitedTag } from '@/types'
import StepperInput from './StepperInput'

interface TagBucketPickerProps {
  bucket: 'preferred' | 'limited' | 'avoided'
  selected: string[]
  selectedLimited?: LimitedTag[]
  available: string[]
  onChange: (selected: string[] | LimitedTag[]) => void
}

const STYLE_SET    = new Set<string>(STYLE_TAGS)
const DIETARY_SET  = new Set<string>(DIETARY_TAGS)
const SEASONAL_SET = new Set<string>(SEASONAL_TAGS)
const CUISINE_SET  = new Set<string>(CUISINE_TAGS)
const PROTEIN_SET  = new Set<string>(PROTEIN_TAGS)

const SECTION_DEFS = [
  { label: 'Style',    set: STYLE_SET },
  { label: 'Dietary',  set: DIETARY_SET },
  { label: 'Seasonal', set: SEASONAL_SET },
  { label: 'Cuisine',  set: CUISINE_SET },
  { label: 'Protein',  set: PROTEIN_SET },
]

function groupTagsIntoSections(tags: string[]): { label: string; tags: string[] }[] {
  const seen = new Set<string>()
  const buckets = new Map<string, string[]>(SECTION_DEFS.map((s) => [s.label, []]))
  const custom: string[] = []
  for (const tag of tags) {
    if (seen.has(tag)) continue
    seen.add(tag)
    let placed = false
    for (const { label, set } of SECTION_DEFS) {
      if (set.has(tag)) { buckets.get(label)!.push(tag); placed = true; break }
    }
    if (!placed) custom.push(tag)
  }
  const result: { label: string; tags: string[] }[] = []
  for (const { label } of SECTION_DEFS) {
    const t = buckets.get(label)!
    if (t.length > 0) result.push({ label, tags: t })
  }
  if (custom.length > 0) result.push({ label: 'Custom', tags: custom })
  return result
}

export default function TagBucketPicker({
  bucket,
  selected,
  selectedLimited,
  available,
  onChange,
}: TagBucketPickerProps) {
  if (bucket === 'limited') {
    const limitedTags = selectedLimited ?? []
    const selectedTagNames = limitedTags.map((lt) => lt.tag)
    const unselectedAvailable = available.filter((t) => !selectedTagNames.includes(t))
    const groups = groupTagsIntoSections(unselectedAvailable)

    const toggleLimitedTag = (tag: string) => {
      const exists = limitedTags.find((lt) => lt.tag === tag)
      if (exists) {
        onChange(limitedTags.filter((lt) => lt.tag !== tag))
      } else {
        onChange([...limitedTags, { tag, cap: 2 }])
      }
    }

    const updateCap = (tag: string, cap: number) => {
      onChange(limitedTags.map((lt) => (lt.tag === tag ? { ...lt, cap } : lt)))
    }

    return (
      <div className="space-y-3">
        {limitedTags.length > 0 && (
          <div>
            <p className="text-xs text-stone-400 mb-1.5">Selected</p>
            <div className="flex flex-wrap gap-2">
              {limitedTags.map((lt) => (
                <div key={lt.tag} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleLimitedTag(lt.tag)}
                    className="px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors bg-amber-100 border-amber-400 text-amber-800"
                  >
                    {lt.tag}
                  </button>
                  <StepperInput
                    value={lt.cap}
                    min={1}
                    max={7}
                    onChange={(v) => updateCap(lt.tag, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {groups.map(({ label, tags }) => (
          <div key={label}>
            <p className="text-xs text-stone-400 mb-1.5">{label}</p>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleLimitedTag(tag)}
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors bg-white border-gray-300 text-gray-600 hover:border-amber-300"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        ))}
        {limitedTags.length === 0 && groups.length === 0 && (
          <p className="text-sm text-gray-400">No tags available</p>
        )}
      </div>
    )
  }

  // preferred / avoided
  const toggle = (tag: string) => {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag))
    } else {
      onChange([...selected, tag])
    }
  }

  const allTags = [...selected, ...available.filter((t) => !selected.includes(t))]
  const groups = groupTagsIntoSections(allTags)

  const selectedColor =
    bucket === 'preferred'
      ? 'bg-green-100 border-green-400 text-green-800'
      : 'bg-red-100 border-red-400 text-red-800'

  return (
    <div className="space-y-3">
      {groups.map(({ label, tags }) => (
        <div key={label}>
          <p className="text-xs text-stone-400 mb-1.5">{label}</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isSelected = selected.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                    isSelected
                      ? selectedColor
                      : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {groups.length === 0 && (
        <p className="text-sm text-gray-400">No tags available</p>
      )}
    </div>
  )
}
