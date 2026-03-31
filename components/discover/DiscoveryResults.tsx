'use client'

import { useState } from 'react'
import type { DiscoveryResult } from '@/types'
import DiscoveryCard from './DiscoveryCard'
import PreviewSheet from './PreviewSheet'

interface ScrapeResult {
  title:               string | null
  ingredients:         string | null
  steps:               string | null
  imageUrl:            string | null
  sourceUrl:           string
  partial:             boolean
  suggestedTags:       string[]
  suggestedNewTags:    { name: string; section: string }[]
  prepTimeMinutes:     number | null
  cookTimeMinutes:     number | null
  totalTimeMinutes:    number | null
  inactiveTimeMinutes: number | null
  servings:            number | null
}

interface DiscoveryResultsProps {
  results:           DiscoveryResult[]
  dismissedUrls:     Set<string>
  status:            'idle' | 'loading' | 'done' | 'error'
  siteFilter:        string
  onDismiss:         (url: string) => void
  onClearSiteFilter: () => void
  getToken:          () => Promise<string>
  onSaved:           () => void
  onEditBeforeSaving: (scrapeResult: ScrapeResult) => void
}

function SkeletonCard() {
  return (
    <div className="bg-[#FFFDF9] border border-[#D4C9BA] rounded-lg overflow-hidden animate-pulse">
      <div className="h-[3px] bg-sage-200" />
      <div className="p-4 space-y-3">
        <div className="h-3 bg-gray-200 rounded w-1/3" />
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-10 bg-gray-100 rounded" />
        <div className="flex gap-2 pt-2">
          <div className="h-8 bg-gray-200 rounded flex-1" />
          <div className="h-8 bg-gray-100 rounded w-20" />
        </div>
      </div>
    </div>
  )
}

export default function DiscoveryResults({
  results,
  dismissedUrls,
  status,
  siteFilter,
  onDismiss,
  onClearSiteFilter,
  getToken,
  onEditBeforeSaving,
}: DiscoveryResultsProps) {
  const [previewingResult, setPreviewingResult] = useState<DiscoveryResult | null>(null)
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set())

  if (status === 'idle') return null

  if (status === 'loading') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <p className="text-sm text-red-600 py-4">Something went wrong — try again</p>
    )
  }

  // status === 'done'
  const visibleResults = results.filter((r) => !dismissedUrls.has(r.url))

  if (visibleResults.length === 0) {
    if (siteFilter) {
      return (
        <div className="py-8 text-center text-sm text-gray-600 space-y-3">
          <p>No results found on {siteFilter} — try searching the whole web</p>
          <button
            type="button"
            onClick={onClearSiteFilter}
            className="text-[#4A7C59] hover:underline font-medium"
          >
            Search all sites
          </button>
        </div>
      )
    }
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        No recipes found — try a different search
      </p>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleResults.map((result) => (
          <DiscoveryCard
            key={result.url}
            result={result}
            saved={savedUrls.has(result.url)}
            onPreview={setPreviewingResult}
            onDismiss={onDismiss}
          />
        ))}
      </div>

      {previewingResult && (
        <PreviewSheet
          result={previewingResult}
          getToken={getToken}
          onClose={() => setPreviewingResult(null)}
          onSaved={(url) => {
            setSavedUrls((prev) => new Set([...prev, url]))
            setPreviewingResult(null)
          }}
          onEditBeforeSaving={(scrapeResult) => {
            setPreviewingResult(null)
            onEditBeforeSaving(scrapeResult)
          }}
        />
      )}
    </>
  )
}
