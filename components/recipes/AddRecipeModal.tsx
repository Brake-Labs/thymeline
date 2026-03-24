'use client'

import { useState } from 'react'
import RecipeForm, { RecipeFormValues } from './RecipeForm'

interface AddRecipeModalProps {
  onClose: () => void
  onSaved: () => void
  getToken: () => Promise<string> | string
}

type Tab = 'url' | 'manual'

interface ScrapeResult {
  title: string | null
  ingredients: string | null
  steps: string | null
  imageUrl: string | null
  sourceUrl: string
  partial: boolean
  suggestedTags:       string[]
  suggestedNewTags:    { name: string; section: string }[]
  prepTimeMinutes:     number | null
  cookTimeMinutes:     number | null
  totalTimeMinutes:    number | null
  inactiveTimeMinutes: number | null
}

export default function AddRecipeModal({
  onClose,
  onSaved,
  getToken,
}: AddRecipeModalProps) {
  const [tab, setTab] = useState<Tab>('url')
  const [urlInput, setUrlInput] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null)
  const [scrapeError, setScrapeError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleScrape() {
    setScrapeError(null)
    setScraping(true)
    try {
      const res = await fetch('/api/recipes/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify({ url: urlInput }),
      })
      const data: ScrapeResult = await res.json()
      if (!res.ok) {
        setScrapeError((data as unknown as { error: string }).error ?? 'Scrape failed')
      } else {
        setScrapeResult(data)
      }
    } catch {
      setScrapeError('Network error')
    } finally {
      setScraping(false)
    }
  }

  async function handleSubmit(values: RecipeFormValues) {
    setIsSubmitting(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: values.title,
          category: values.category || undefined,
          tags: values.tags,
          ingredients: values.ingredients || null,
          steps: values.steps || null,
          notes: values.notes || null,
          url: values.url || null,
          image_url: values.image_url || null,
          prep_time_minutes: values.prep_time_minutes !== '' ? Number(values.prep_time_minutes) : null,
          cook_time_minutes: values.cook_time_minutes !== '' ? Number(values.cook_time_minutes) : null,
          total_time_minutes: values.total_time_minutes !== '' ? Number(values.total_time_minutes) : null,
          inactive_time_minutes: values.inactive_time_minutes !== '' ? Number(values.inactive_time_minutes) : null,
        }),
      })
      if (!res.ok) {
        const err: { error?: string } = await res.json()
        throw new Error(err.error ?? 'Save failed')
      }
      const created: { id: string } = await res.json()
      // Optionally log a "last made" date if the user set one
      if (values.lastMade && created.id) {
        await fetch(`/api/recipes/${created.id}/log`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ made_on: values.lastMade }),
        })
      }
      onSaved()
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  // Build clean initial values (nulls → undefined so RecipeFormValues stays string-typed)
  const formInitialValues: Partial<RecipeFormValues> | undefined = scrapeResult
    ? {
        title: scrapeResult.title ?? undefined,
        ingredients: scrapeResult.ingredients ?? undefined,
        steps: scrapeResult.steps ?? undefined,
        image_url: scrapeResult.imageUrl ?? undefined,
        url: scrapeResult.sourceUrl,
        prep_time_minutes: scrapeResult.prepTimeMinutes !== null ? String(scrapeResult.prepTimeMinutes) : '',
        cook_time_minutes: scrapeResult.cookTimeMinutes !== null ? String(scrapeResult.cookTimeMinutes) : '',
        total_time_minutes: scrapeResult.totalTimeMinutes !== null ? String(scrapeResult.totalTimeMinutes) : '',
        inactive_time_minutes: scrapeResult.inactiveTimeMinutes !== null ? String(scrapeResult.inactiveTimeMinutes) : '',
      }
    : undefined

  // Track which fields the scrape couldn't find — used to show "Couldn't find this" placeholder
  const nullFields: Set<string> | undefined = scrapeResult
    ? new Set(
        (
          ['title', 'ingredients', 'steps'] as const
        ).filter((f) => scrapeResult[f] === null),
      )
    : undefined

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-display text-lg font-semibold text-gray-900">Add Recipe</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {(['url', 'manual'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'url' ? 'From URL' : 'Manual'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          {tab === 'url' && !scrapeResult && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Recipe URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleScrape}
                  disabled={scraping || !urlInput.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {scraping ? (
                    <>
                      <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Reading recipe…
                    </>
                  ) : (
                    'Scrape'
                  )}
                </button>
              </div>
              {scrapeError && <p className="text-sm text-red-500">{scrapeError}</p>}
            </div>
          )}

          {(tab === 'manual' || scrapeResult) && (
            <RecipeForm
              initialValues={formInitialValues ?? {}}
              nullFields={nullFields}
              suggestedTags={scrapeResult?.suggestedTags}
              pendingNewTags={scrapeResult?.suggestedNewTags}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </div>
    </div>
  )
}
