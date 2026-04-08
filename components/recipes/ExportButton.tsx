'use client'

import { useState } from 'react'
import { slugify, triggerDownloadOrShare } from '@/lib/recipe-export'
import ExportProgress from './ExportProgress'

interface Props {
  recipeId: string
  recipeTitle: string
}

export default function ExportButton({ recipeId, recipeTitle }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/recipes/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_ids: [recipeId], format: 'single' }),
      })
      if (!res.ok) {
        setError("Couldn't generate PDF — please try again.")
        return
      }
      const blob = await res.blob()
      triggerDownloadOrShare(blob, `${slugify(recipeTitle)}.pdf`, 'application/pdf')
    } catch {
      setError("Couldn't generate PDF — please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="inline-flex flex-col items-start">
      {loading ? (
        <ExportProgress message="Generating PDF..." />
      ) : (
        <button
          onClick={() => void handleExport()}
          className="font-display font-medium text-[13px] text-stone-700 border border-stone-200 rounded-xl py-2 px-4 bg-white hover:bg-stone-50"
        >
          Share as PDF
        </button>
      )}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}
