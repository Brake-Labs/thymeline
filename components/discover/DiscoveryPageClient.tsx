'use client'

import { useState, useCallback } from 'react'
import type { DiscoveryResult, ScrapeResult } from '@/types'
import DiscoverySearch from './DiscoverySearch'
import DiscoveryResults from './DiscoveryResults'
import AddRecipeModal from '@/components/recipes/AddRecipeModal'

type Status = 'idle' | 'loading' | 'done' | 'error'

export default function DiscoveryPageClient() {
  const [query, setQuery] = useState('')
  const [siteFilter, setSiteFilter] = useState('')
  const [results, setResults] = useState<DiscoveryResult[]>([])
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<Status>('idle')
  const [editScrapeResult, setEditScrapeResult] = useState<ScrapeResult | null>(null)

  const handleSubmit = useCallback(async (q: string, site: string) => {
    if (!q.trim()) return
    setStatus('loading')
    setResults([])
    setDismissedUrls(new Set())

    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: q.trim(),
          ...(site.trim() ? { siteFilter: site.trim() } : {}),
        }),
      })

      if (!res.ok) {
        setStatus('error')
        return
      }

      const data: { results: DiscoveryResult[] } = await res.json()
      setResults(data.results ?? [])
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }, [])

  const handleSearchSubmit = useCallback(() => {
    handleSubmit(query, siteFilter)
  }, [query, siteFilter, handleSubmit])

  const handleClearSiteFilter = useCallback(() => {
    setSiteFilter('')
    handleSubmit(query, '')
  }, [query, handleSubmit])

  const handleDismiss = useCallback((url: string) => {
    setDismissedUrls((prev) => new Set([...prev, url]))
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <DiscoverySearch
        query={query}
        siteFilter={siteFilter}
        isLoading={status === 'loading'}
        onQueryChange={setQuery}
        onSiteChange={setSiteFilter}
        onSubmit={handleSearchSubmit}
        onChipSelect={(chip) => {
          setQuery(chip)
          handleSubmit(chip, siteFilter)
        }}
      />

      <DiscoveryResults
        results={results}
        dismissedUrls={dismissedUrls}
        status={status}
        siteFilter={siteFilter}
        onDismiss={handleDismiss}
        onClearSiteFilter={handleClearSiteFilter}
        onSaved={() => { /* no-op: saved badge handled inside DiscoveryResults */ }}
        onEditBeforeSaving={(scrapeResult) => setEditScrapeResult(scrapeResult)}
      />

      {editScrapeResult && (
        <AddRecipeModal
          onClose={() => setEditScrapeResult(null)}
          onSaved={() => setEditScrapeResult(null)}
          prefillScrapeResult={editScrapeResult}
        />
      )}
    </div>
  )
}
