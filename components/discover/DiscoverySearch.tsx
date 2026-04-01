'use client'

import { useState, useRef } from 'react'

const EXAMPLE_CHIPS = [
  'Simple sourdough recipes',
  'New slow cooker dinners',
  'Healthy weeknight meals',
  'Desserts I haven\'t tried',
]

interface DiscoverySearchProps {
  query:         string
  siteFilter:    string
  isLoading:     boolean
  onQueryChange: (q: string) => void
  onSiteChange:  (s: string) => void
  onSubmit:      () => void
  onChipSelect:  (chip: string) => void
}

export default function DiscoverySearch({
  query,
  siteFilter,
  isLoading,
  onQueryChange,
  onSiteChange,
  onSubmit,
  onChipSelect,
}: DiscoverySearchProps) {
  const [showSiteFilter, setShowSiteFilter] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !isLoading) {
      onSubmit()
    }
  }

  return (
    <div className="mb-8">
      <h1 className="font-display font-bold text-[22px] text-sage-900 mb-1">
        Discover Recipes
      </h1>
      <p className="font-sans text-sm text-stone-500 mb-5">
        Find new recipes from across the web
      </p>

      {/* Main search bar */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything — 'easy slow cooker recipes unlike anything I have' or 'Budget Bytes new dinner recipes'"
          className="flex-1 border border-stone-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
          disabled={isLoading}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading || !query.trim()}
          className="bg-sage-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
        >
          {isLoading ? (
            <>
              <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              Searching…
            </>
          ) : (
            'Discover'
          )}
        </button>
      </div>

      {/* Site filter — hidden by default on mobile */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowSiteFilter((v) => !v)}
          className="md:hidden text-xs text-sage-500 hover:underline"
        >
          {showSiteFilter ? 'Hide site filter' : 'Filter by site +'}
        </button>

        <div className={`mt-2 ${showSiteFilter ? 'block' : 'hidden md:block'}`}>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Search a specific site
          </label>
          <input
            type="text"
            value={siteFilter}
            onChange={(e) => onSiteChange(e.target.value)}
            placeholder="e.g. budgetbytes.com, seriouseats.com"
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500 text-stone-700"
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Example prompt chips — shown only when query is empty */}
      {!query && (
        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLE_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChipSelect(chip)}
              className="text-sm px-3 py-1.5 rounded-full border border-stone-200 bg-white text-stone-600 hover:border-sage-500 hover:text-sage-500 transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
