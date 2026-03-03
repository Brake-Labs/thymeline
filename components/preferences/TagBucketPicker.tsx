'use client'

import { LimitedTag } from '@/types'
import StepperInput from './StepperInput'

interface TagBucketPickerProps {
  bucket: 'preferred' | 'limited' | 'avoided'
  selected: string[]
  selectedLimited?: LimitedTag[]
  available: string[]
  onChange: (selected: string[] | LimitedTag[]) => void
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

    const toggleLimitedTag = (tag: string) => {
      const exists = limitedTags.find((lt) => lt.tag === tag)
      if (exists) {
        onChange(limitedTags.filter((lt) => lt.tag !== tag))
      } else {
        onChange([...limitedTags, { tag, cap: 2 }])
      }
    }

    const updateCap = (tag: string, cap: number) => {
      onChange(limitedTags.map((lt) => lt.tag === tag ? { ...lt, cap } : lt))
    }

    const selectedTags = limitedTags.map((lt) => lt.tag)
    // Show selected tags first, then available unselected tags
    const unselectedAvailable = available.filter((t) => !selectedTags.includes(t))
    const allTags = [...selectedTags, ...unselectedAvailable]

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => {
            const isSelected = selectedTags.includes(tag)
            const limitedTag = limitedTags.find((lt) => lt.tag === tag)
            return (
              <div key={tag} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleLimitedTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    isSelected
                      ? 'bg-amber-100 border-amber-400 text-amber-800'
                      : 'bg-white border-gray-300 text-gray-600 hover:border-amber-300'
                  }`}
                >
                  {tag}
                </button>
                {isSelected && limitedTag && (
                  <StepperInput
                    value={limitedTag.cap}
                    min={1}
                    max={7}
                    onChange={(v) => updateCap(tag, v)}
                  />
                )}
              </div>
            )
          })}
        </div>
        {allTags.length === 0 && (
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

  // Show selected tags first, then unselected available tags
  const unselectedAvailable = available.filter((t) => !selected.includes(t))
  const allTags = [...selected, ...unselectedAvailable]

  const selectedColor =
    bucket === 'preferred'
      ? 'bg-green-100 border-green-400 text-green-800'
      : 'bg-red-100 border-red-400 text-red-800'

  return (
    <div className="flex flex-wrap gap-2">
      {allTags.map((tag) => {
        const isSelected = selected.includes(tag)
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              isSelected
                ? selectedColor
                : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
            }`}
          >
            {tag}
          </button>
        )
      })}
      {allTags.length === 0 && (
        <p className="text-sm text-gray-400">No tags available</p>
      )}
    </div>
  )
}
