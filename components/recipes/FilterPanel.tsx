'use client'

import { useState } from 'react'
import type { RecipeFilters, Recipe } from '@/types'
import {
  STYLE_TAGS,
  DIETARY_TAGS,
  SEASONAL_TAGS,
  CUISINE_TAGS,
  PROTEIN_TAGS,
} from '@/lib/tags'

const CATEGORY_OPTIONS: { value: Recipe['category']; label: string }[] = [
  { value: 'main_dish', label: 'Main Dish' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'side_dish', label: 'Side Dish' },
]

const KNOWN_TAGS = new Set<string>([
  ...STYLE_TAGS,
  ...DIETARY_TAGS,
  ...SEASONAL_TAGS,
  ...CUISINE_TAGS,
  ...PROTEIN_TAGS,
])

function timeLabel(max: number | null): string {
  if (max === null || max >= 240) return 'Any time'
  if (max < 60) return `Under ${max} min`
  const h = max / 60
  return `Under ${h === 1 ? '1 hr' : `${h} hr`}`
}

interface FilterPanelProps {
  pendingFilters: RecipeFilters
  onPendingChange: (f: RecipeFilters) => void
  onApply: () => void
  onClearAll: () => void
  vaultTags: string[]
}

export default function FilterPanel({
  pendingFilters,
  onPendingChange,
  onApply,
  onClearAll,
  vaultTags,
}: FilterPanelProps) {
  const [lastMadePreset, setLastMadePreset] = useState<string | null>(null)

  function toggleTag(tag: string) {
    const next = pendingFilters.tags.includes(tag)
      ? pendingFilters.tags.filter((t) => t !== tag)
      : [...pendingFilters.tags, tag]
    onPendingChange({ ...pendingFilters, tags: next })
  }

  function toggleCategory(cat: Recipe['category']) {
    const next = pendingFilters.categories.includes(cat)
      ? pendingFilters.categories.filter((c) => c !== cat)
      : [...pendingFilters.categories, cat]
    onPendingChange({ ...pendingFilters, categories: next })
  }

  function setTimeSlider(val: number) {
    onPendingChange({ ...pendingFilters, maxTotalMinutes: val >= 240 ? null : val })
  }

  function setDateFrom(val: string) {
    setLastMadePreset(null)
    onPendingChange({ ...pendingFilters, lastMadeFrom: val || null, neverMade: false })
  }

  function setDateTo(val: string) {
    setLastMadePreset(null)
    onPendingChange({ ...pendingFilters, lastMadeTo: val || null, neverMade: false })
  }

  function applyPreset(preset: string) {
    setLastMadePreset(preset)
    const today = new Date()
    const fmt = (d: Date) => d.toISOString().split('T')[0]

    if (preset === 'never') {
      onPendingChange({ ...pendingFilters, neverMade: true, lastMadeFrom: null, lastMadeTo: null })
      return
    }

    let from: string | null = null
    if (preset === 'week') {
      const d = new Date(today); d.setDate(d.getDate() - 7); from = fmt(d)
    } else if (preset === 'month') {
      const d = new Date(today); d.setMonth(d.getMonth() - 1); from = fmt(d)
    } else if (preset === '3months') {
      const d = new Date(today); d.setMonth(d.getMonth() - 3); from = fmt(d)
    }
    onPendingChange({ ...pendingFilters, neverMade: false, lastMadeFrom: from, lastMadeTo: fmt(today) })
  }

  const otherTags = vaultTags.filter((t) => !KNOWN_TAGS.has(t))

  const tagGroupClass = 'flex flex-wrap gap-1.5'
  const pillBase = 'px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors border'
  const pillOff = 'border-stone-200 text-stone-600 bg-white hover:border-sage-400 hover:text-sage-700'
  const pillOn = 'border-sage-500 text-white bg-sage-500'

  function TagPills({ tags }: { tags: readonly string[] }) {
    return (
      <div className={tagGroupClass}>
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={`${pillBase} ${pendingFilters.tags.includes(tag) ? pillOn : pillOff}`}
          >
            {tag}
          </button>
        ))}
      </div>
    )
  }

  const sliderVal = pendingFilters.maxTotalMinutes ?? 240

  return (
    <div className="border border-stone-200 rounded-lg bg-[#F7F4F0] p-5 space-y-5">
      {/* Row 1: Style / Dietary / Protein */}
      <div className="grid grid-cols-3 gap-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-2">Style</p>
          <TagPills tags={STYLE_TAGS} />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-2">Dietary</p>
          <TagPills tags={DIETARY_TAGS} />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-2">Protein</p>
          <TagPills tags={PROTEIN_TAGS} />
        </div>
      </div>

      <hr className="border-dashed border-stone-300" />

      {/* Row 2: Cuisine / Seasonal / Category */}
      <div className="grid grid-cols-3 gap-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-2">Cuisine</p>
          <TagPills tags={CUISINE_TAGS} />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-2">Seasonal</p>
          <TagPills tags={SEASONAL_TAGS} />
          {otherTags.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mt-3 mb-2">Other</p>
              <TagPills tags={otherTags} />
            </>
          )}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-2">Category</p>
          <div className={tagGroupClass}>
            {CATEGORY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleCategory(value)}
                className={`${pillBase} ${pendingFilters.categories.includes(value) ? pillOn : pillOff}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <hr className="border-dashed border-stone-300" />

      {/* Row 3: Time slider + Last made */}
      <div className="grid grid-cols-2 gap-6">
        {/* Total time slider */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-2">Total Time</p>
          <input
            type="range"
            min={15}
            max={240}
            step={15}
            value={sliderVal}
            onChange={(e) => setTimeSlider(parseInt(e.target.value, 10))}
            className="w-full accent-sage-500"
          />
          <div className="flex justify-between text-[10px] text-stone-400 mt-1">
            <span>15 min</span>
            <span>1 hr</span>
            <span>2 hr</span>
            <span>4 hr+</span>
          </div>
          <p className="text-xs text-sage-700 font-medium mt-2">{timeLabel(pendingFilters.maxTotalMinutes)}</p>
        </div>

        {/* Last made date range */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400 mb-2">Last Made</p>
          <div className="flex gap-2 mb-2">
            <div className="flex-1">
              <label className="block text-[10px] text-stone-400 mb-1">From</label>
              <input
                type="date"
                value={pendingFilters.lastMadeFrom ?? ''}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full border border-stone-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-sage-400"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-stone-400 mb-1">To</label>
              <input
                type="date"
                value={pendingFilters.lastMadeTo ?? ''}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full border border-stone-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-sage-400"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: 'week', label: 'This week' },
              { key: 'month', label: 'This month' },
              { key: '3months', label: 'Last 3 months' },
              { key: 'never', label: 'Never made' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  lastMadePreset === key
                    ? 'border-sage-500 bg-sage-500 text-white'
                    : 'border-stone-200 text-stone-500 hover:border-sage-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center pt-2 border-t border-stone-200">
        <button
          type="button"
          onClick={() => { setLastMadePreset(null); onClearAll() }}
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={onApply}
          className="px-4 py-2 rounded text-sm font-medium bg-sage-500 text-white hover:bg-sage-600"
        >
          Apply filters
        </button>
      </div>
    </div>
  )
}
