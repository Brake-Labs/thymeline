'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface GenerateGroceriesButtonProps {
  /** Preferred: explicit date range */
  dateFrom?: string
  dateTo?:   string
  /** Legacy: single week_start (still accepted by the API) */
  weekStart?: string
}

export default function GenerateGroceriesButton({ dateFrom, dateTo, weekStart }: GenerateGroceriesButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const router = useRouter()

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const payload = dateFrom && dateTo
        ? { date_from: dateFrom, date_to: dateTo }
        : { week_start: weekStart }

      const res = await fetch('/api/groceries/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Failed to generate grocery list')
        return
      }
      // Navigate to the list using date_from as the key
      if (dateFrom) {
        router.push(`/groceries?date_from=${dateFrom}&date_to=${dateTo}`)
      }
      router.refresh()
    } catch {
      setError('Failed to generate grocery list')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="font-display px-6 py-3 bg-sage-500 text-white text-sm font-semibold rounded-lg hover:bg-sage-600 disabled:opacity-60"
      >
        {loading ? 'Generating…' : 'Generate grocery list'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
