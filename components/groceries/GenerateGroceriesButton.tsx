'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAccessToken } from '@/lib/supabase/browser'

interface GenerateGroceriesButtonProps {
  weekStart: string
}

export default function GenerateGroceriesButton({ weekStart }: GenerateGroceriesButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/groceries/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ week_start: weekStart }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Failed to generate grocery list')
        return
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
        className="px-6 py-3 bg-sage-500 text-white text-sm font-semibold rounded-lg hover:bg-sage-600 disabled:opacity-60"
      >
        {loading ? 'Generating…' : 'Generate grocery list'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
