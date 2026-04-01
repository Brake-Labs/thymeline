'use client'

import Link from 'next/link'

interface Props {
  summary: {
    imported:  number
    skipped:   number
    replaced:  number
    failed:    { title: string; error: string }[]
  }
  partialRecipes: { id: string; title: string }[]
  onImportMore:   () => void
}

export default function ImportSummary({ summary, partialRecipes, onImportMore }: Props) {
  const partial = partialRecipes.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-800">Import complete</h1>
        <p className="text-stone-500 mt-1 text-sm">Your recipes have been added to Forkcast.</p>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold text-green-700">{summary.imported}</div>
          <div className="text-xs text-green-600 mt-0.5">✓ Imported</div>
        </div>
        {partial > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-center">
            <div className="text-2xl font-bold text-yellow-700">{partial}</div>
            <div className="text-xs text-yellow-600 mt-0.5">⚠ Partial</div>
          </div>
        )}
        {summary.replaced > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{summary.replaced}</div>
            <div className="text-xs text-blue-600 mt-0.5">🔁 Replaced</div>
          </div>
        )}
        {summary.skipped > 0 && (
          <div className="bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 text-center">
            <div className="text-2xl font-bold text-stone-600">{summary.skipped}</div>
            <div className="text-xs text-stone-500 mt-0.5">Skipped</div>
          </div>
        )}
        {summary.failed.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
            <div className="text-2xl font-bold text-red-700">{summary.failed.length}</div>
            <div className="text-xs text-red-600 mt-0.5">✗ Failed</div>
          </div>
        )}
      </div>

      {/* Partial recipes */}
      {partialRecipes.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-stone-700 mb-2">
            These recipes are missing some data
          </h2>
          <ul className="space-y-1">
            {partialRecipes.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/recipes/${r.id}/edit`}
                  className="text-sm text-sage-600 hover:text-sage-800 hover:underline"
                >
                  Complete {r.title} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Failed recipes */}
      {summary.failed.length > 0 && (
        <details className="border border-red-200 rounded-lg overflow-hidden">
          <summary className="px-4 py-2 text-sm font-medium text-red-700 cursor-pointer bg-red-50 select-none">
            Failed recipes ({summary.failed.length})
          </summary>
          <ul className="divide-y divide-red-100">
            {summary.failed.map((f, i) => (
              <li key={i} className="px-4 py-2 text-sm">
                <span className="font-medium text-stone-700">{f.title}</span>
                <span className="text-red-500 ml-2">{f.error}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Link
          href="/recipes"
          className="px-5 py-2 bg-sage-500 text-white rounded-lg text-sm font-medium hover:bg-sage-600 transition-colors"
        >
          View your recipes
        </Link>
        <button
          type="button"
          onClick={onImportMore}
          className="px-4 py-2 text-sm text-stone-600 border border-stone-300 rounded-lg hover:border-sage-400 hover:text-sage-700 transition-colors"
        >
          Import more
        </button>
      </div>
    </div>
  )
}
