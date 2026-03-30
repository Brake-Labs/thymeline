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
  { value: 'main_dish',  label: 'Main Dish' },
  { value: 'breakfast',  label: 'Breakfast' },
  { value: 'dessert',    label: 'Dessert' },
  { value: 'side_dish',  label: 'Side Dish' },
]

const TIME_BUCKETS: { max: number | null; label: string }[] = [
  { max: null,  label: 'Any time' },
  { max: 30,    label: 'Under 30 min' },
  { max: 60,    label: 'Under 1 hr' },
  { max: 120,   label: 'Under 2 hr' },
  { max: 240,   label: 'Under 4 hr' },
]

const LAST_MADE_PRESETS = [
  { key: 'week',    label: 'This week' },
  { key: 'month',   label: 'This month' },
  { key: '3months', label: 'Last 3 months' },
  { key: 'never',   label: 'Never made' },
]

const KNOWN_TAGS = new Set<string>([
  ...STYLE_TAGS,
  ...DIETARY_TAGS,
  ...SEASONAL_TAGS,
  ...CUISINE_TAGS,
  ...PROTEIN_TAGS,
])

interface Props {
  filters: RecipeFilters
  onChange: (f: RecipeFilters) => void
  onClearAll: () => void
  vaultTags: string[]
  activeCount: number
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function Section({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-stone-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-stone-500">
            {title}
          </span>
          {count != null && count > 0 && (
            <span className="text-[10px] font-semibold bg-sage-500 text-white rounded-full px-1.5 py-0.5 leading-none">
              {count}
            </span>
          )}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  )
}

export default function FilterSidebar({ filters, onChange, onClearAll, vaultTags, activeCount }: Props) {
  const pillBase = 'px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors border'
  const pillOff = 'border-stone-200 text-stone-600 bg-white hover:border-sage-400 hover:text-sage-700'
  const pillOn = 'border-sage-500 text-white bg-sage-500'

  function toggleTag(tag: string) {
    const next = filters.tags.includes(tag)
      ? filters.tags.filter((t) => t !== tag)
      : [...filters.tags, tag]
    onChange({ ...filters, tags: next })
  }

  function toggleCategory(cat: Recipe['category']) {
    const next = filters.categories.includes(cat)
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat]
    onChange({ ...filters, categories: next })
  }

  function setTimeBucket(max: number | null) {
    onChange({ ...filters, maxTotalMinutes: max })
  }

  function applyLastMadePreset(preset: string) {
    const today = new Date()
    const fmt = (d: Date) => d.toISOString().split('T')[0]!

    if (preset === 'never') {
      onChange({ ...filters, neverMade: true, lastMadeFrom: null, lastMadeTo: null })
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
    onChange({ ...filters, neverMade: false, lastMadeFrom: from, lastMadeTo: fmt(today) })
  }

  function clearLastMade() {
    onChange({ ...filters, neverMade: false, lastMadeFrom: null, lastMadeTo: null })
  }

  function TagPills({ tags, activeSet }: { tags: readonly string[]; activeSet: string[] }) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={`${pillBase} ${activeSet.includes(tag) ? pillOn : pillOff}`}
          >
            {tag}
          </button>
        ))}
      </div>
    )
  }

  const otherTags = vaultTags.filter((t) => !KNOWN_TAGS.has(t))

  // Derive active last-made preset key
  const today = new Date().toISOString().split('T')[0]
  let activeLastMadePreset: string | null = null
  if (filters.neverMade) {
    activeLastMadePreset = 'never'
  } else if (filters.lastMadeTo === today) {
    const from = filters.lastMadeFrom
    if (from) {
      const diffDays = Math.round((Date.now() - new Date(from).getTime()) / 86400000)
      if (diffDays <= 8) activeLastMadePreset = 'week'
      else if (diffDays <= 32) activeLastMadePreset = 'month'
      else activeLastMadePreset = '3months'
    }
  }

  const lastMadeCount =
    filters.neverMade || filters.lastMadeFrom || filters.lastMadeTo ? 1 : 0

  return (
    <div className="bg-[#F7F4F0] rounded-lg border border-stone-200 px-4">
      {/* Sidebar header */}
      <div className="flex items-center justify-between py-3 border-b border-stone-200">
        <span className="text-sm font-semibold text-stone-700">
          Filters
          {activeCount > 0 && (
            <span className="ml-2 text-xs font-semibold bg-sage-500 text-white rounded-full px-1.5 py-0.5">
              {activeCount}
            </span>
          )}
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-stone-400 hover:text-stone-700 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Category */}
      <Section title="Category" count={filters.categories.length}>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => toggleCategory(value)}
              className={`${pillBase} ${filters.categories.includes(value) ? pillOn : pillOff}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Style */}
      <Section title="Style" count={filters.tags.filter((t) => STYLE_TAGS.includes(t as never)).length}>
        <TagPills tags={STYLE_TAGS} activeSet={filters.tags} />
      </Section>

      {/* Dietary */}
      <Section title="Dietary" count={filters.tags.filter((t) => DIETARY_TAGS.includes(t as never)).length}>
        <TagPills tags={DIETARY_TAGS} activeSet={filters.tags} />
      </Section>

      {/* Protein */}
      <Section title="Protein" count={filters.tags.filter((t) => PROTEIN_TAGS.includes(t as never)).length}>
        <TagPills tags={PROTEIN_TAGS} activeSet={filters.tags} />
      </Section>

      {/* Cuisine */}
      <Section title="Cuisine" count={filters.tags.filter((t) => CUISINE_TAGS.includes(t as never)).length}>
        <TagPills tags={CUISINE_TAGS} activeSet={filters.tags} />
      </Section>

      {/* Seasonal */}
      <Section title="Seasonal" count={filters.tags.filter((t) => SEASONAL_TAGS.includes(t as never)).length}>
        <TagPills tags={SEASONAL_TAGS} activeSet={filters.tags} />
      </Section>

      {/* Custom tags */}
      {otherTags.length > 0 && (
        <Section title="Other" count={filters.tags.filter((t) => otherTags.includes(t)).length}>
          <TagPills tags={otherTags} activeSet={filters.tags} />
        </Section>
      )}

      {/* Cook time */}
      <Section title="Cook Time" count={filters.maxTotalMinutes !== null ? 1 : 0}>
        <div className="space-y-1">
          {TIME_BUCKETS.map(({ max, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => setTimeBucket(max)}
              className={`w-full text-left text-xs px-2.5 py-1.5 rounded transition-colors ${
                filters.maxTotalMinutes === max
                  ? 'bg-sage-500 text-white font-medium'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Last made */}
      <Section title="Last Made" count={lastMadeCount}>
        <div className="space-y-1.5">
          {LAST_MADE_PRESETS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => activeLastMadePreset === key ? clearLastMade() : applyLastMadePreset(key)}
              className={`w-full text-left text-xs px-2.5 py-1.5 rounded transition-colors ${
                activeLastMadePreset === key
                  ? 'bg-sage-500 text-white font-medium'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {label}
            </button>
          ))}
          {/* Custom date range */}
          <div className="pt-2 space-y-2">
            <div>
              <label className="block text-[10px] text-stone-400 mb-1">From</label>
              <input
                type="date"
                value={filters.lastMadeFrom ?? ''}
                onChange={(e) => onChange({ ...filters, neverMade: false, lastMadeFrom: e.target.value || null })}
                className="w-full border border-stone-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-sage-400"
              />
            </div>
            <div>
              <label className="block text-[10px] text-stone-400 mb-1">To</label>
              <input
                type="date"
                value={filters.lastMadeTo ?? ''}
                onChange={(e) => onChange({ ...filters, neverMade: false, lastMadeTo: e.target.value || null })}
                className="w-full border border-stone-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-sage-400"
              />
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
