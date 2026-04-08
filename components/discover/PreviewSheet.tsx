'use client'

import { useEffect, useState } from 'react'
import type { DiscoveryResult, RecipeListItem, ScrapeResult } from '@/types'

interface PreviewSheetProps {
  result:             DiscoveryResult
  onClose:            () => void
  onSaved:            (url: string) => void
  onEditBeforeSaving: (scrapeResult: ScrapeResult) => void
}

type SheetState = 'loading' | 'ready' | 'saving' | 'saved' | 'error'

function formatMinutes(minutes: number | null): string | null {
  if (minutes === null) return null
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function PreviewSheet({
  result,
  onClose,
  onSaved,
  onEditBeforeSaving,
}: PreviewSheetProps) {
  const [state, setState] = useState<SheetState>('loading')
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [existingRecipeId, setExistingRecipeId] = useState<string | null>(null)

  // Scrape on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/recipes/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: result.url }),
        })
        if (cancelled) return
        if (!res.ok) {
          setState('error')
          return
        }
        const data: ScrapeResult = await res.json()
        if (cancelled) return
        setScrapeResult(data)

        // Duplicate check — fetch all recipes and filter client-side for matching URL
        try {
          const listRes = await fetch('/api/recipes')
          if (!cancelled && listRes.ok) {
            const recipes: RecipeListItem[] = await listRes.json()
            // RecipeListItem doesn't have url, but the API returns it; cast via unknown
            const match = (recipes as unknown as { id: string; url?: string | null }[]).find(
              (r) => r.url && r.url === result.url
            )
            if (!cancelled && match) {
              setExistingRecipeId(match.id)
            }
          }
        } catch {
          // Non-fatal — duplicate check failure just means no badge shown
        }

        if (!cancelled) setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.url])

  async function handleSave() {
    if (!scrapeResult) return
    setState('saving')
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: scrapeResult.title ?? result.title,
          category: 'main_dish',
          tags: scrapeResult.suggestedTags,
          ingredients: scrapeResult.ingredients ?? null,
          steps: scrapeResult.steps ?? null,
          url: scrapeResult.sourceUrl,
          imageUrl: scrapeResult.imageUrl ?? null,
          prepTimeMinutes: scrapeResult.prepTimeMinutes ?? null,
          cookTimeMinutes: scrapeResult.cookTimeMinutes ?? null,
          totalTimeMinutes: scrapeResult.totalTimeMinutes ?? null,
          inactiveTimeMinutes: scrapeResult.inactiveTimeMinutes ?? null,
          servings: scrapeResult.servings ?? null,
          source: 'scraped',
        }),
      })
      if (!res.ok) {
        setState('ready')
        return
      }
      const created: { id: string } = await res.json()
      setSavedId(created.id)
      setState('saved')
      onSaved(result.url)
    } catch {
      setState('ready')
    }
  }

  const title = scrapeResult?.title ?? result.title

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto py-8 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl relative">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b gap-4">
          <h2 className="font-display font-semibold text-sage-900 text-lg leading-snug flex-1">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 text-2xl leading-none flex-shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto max-h-[70vh]">
          {state === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-stone-500">
              <span className="inline-block h-8 w-8 border-2 border-sage-500 border-t-transparent rounded-full animate-spin" aria-label="Loading" />
              <p className="text-sm">Loading recipe…</p>
            </div>
          )}

          {state === 'error' && (
            <div className="py-8 text-center text-sm text-stone-600">
              <p className="mb-3">Couldn&apos;t load this recipe — try opening it directly</p>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sage-500 hover:underline"
              >
                Open recipe →
              </a>
            </div>
          )}

          {(state === 'ready' || state === 'saving' || state === 'saved') && scrapeResult && (
            <div className="space-y-5">
              {/* Hero image */}
              {scrapeResult.imageUrl && (
                <img
                  src={scrapeResult.imageUrl}
                  alt={title ?? ''}
                  className="w-full max-h-80 object-cover rounded-lg"
                />
              )}

              {/* Metadata */}
              {(() => {
                const prep  = formatMinutes(scrapeResult.prepTimeMinutes)
                const cook  = formatMinutes(scrapeResult.cookTimeMinutes)
                const total = formatMinutes(scrapeResult.totalTimeMinutes)
                const fields: { label: string; value: string }[] = []
                if (prep)  fields.push({ label: 'Prep',     value: prep  })
                if (cook)  fields.push({ label: 'Cook',     value: cook  })
                if (total) fields.push({ label: 'Total',    value: total })
                if (scrapeResult.servings) fields.push({ label: 'Serves', value: String(scrapeResult.servings) })
                return fields.length > 0 ? (
                  <div className="flex flex-wrap gap-4">
                    {fields.map((f) => (
                      <div key={f.label} className="text-sm">
                        <span className="text-stone-500">{f.label}: </span>
                        <span className="font-medium text-sage-900">{f.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null
              })()}

              {/* Tags */}
              {scrapeResult.suggestedTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {scrapeResult.suggestedTags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-sage-50 text-sage-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Ingredients */}
              {scrapeResult.ingredients && (
                <div>
                  <h3 className="font-display font-semibold text-sm text-sage-900 mb-2">Ingredients</h3>
                  <p className="text-sm text-stone-700 whitespace-pre-wrap">{scrapeResult.ingredients}</p>
                </div>
              )}

              {/* Steps */}
              {scrapeResult.steps && (
                <div>
                  <h3 className="font-display font-semibold text-sm text-sage-900 mb-2">Instructions</h3>
                  <p className="text-sm text-stone-700 whitespace-pre-wrap">{scrapeResult.steps}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {(state === 'ready' || state === 'saving' || state === 'saved') && (
          <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex flex-wrap gap-3 items-center">
            {state === 'saved' ? (
              <>
                <span className="text-sm font-medium text-sage-500">Saved to vault ✓</span>
                {savedId && (
                  <a
                    href={`/recipes/${savedId}`}
                    className="text-sm text-sage-500 hover:underline"
                  >
                    View in vault →
                  </a>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="ml-auto text-sm font-medium text-stone-500 px-4 py-2 rounded-lg border border-stone-200 hover:border-stone-300"
                >
                  Close
                </button>
              </>
            ) : existingRecipeId ? (
              <>
                <span className="text-sm text-stone-500 font-medium">Already in your vault</span>
                <a
                  href={`/recipes/${existingRecipeId}`}
                  className="text-sm text-sage-500 hover:underline"
                >
                  View →
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="ml-auto text-sm font-medium text-stone-500 px-4 py-2 rounded-lg border border-stone-200 hover:border-stone-300"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={state === 'saving'}
                  className="bg-sage-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {state === 'saving' ? 'Saving…' : 'Save to Vault'}
                </button>
                <button
                  type="button"
                  onClick={() => { if (scrapeResult) { onEditBeforeSaving(scrapeResult); onClose() } }}
                  className="text-sm font-medium text-stone-600 px-4 py-2 rounded-lg border border-stone-200 hover:border-stone-300"
                >
                  Edit before saving
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-sm font-medium text-stone-500 px-4 py-2 rounded-lg border border-stone-200 hover:border-stone-300"
                >
                  Close
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
