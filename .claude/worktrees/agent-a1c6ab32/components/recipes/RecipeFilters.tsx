'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getAccessToken } from '@/lib/supabase/browser'
import { CATEGORY_OPTIONS } from '@/lib/category-labels'

const FILTER_CATEGORY_OPTIONS = [
  { value: '' as string, label: 'All Categories' },
  ...CATEGORY_OPTIONS,
]

export default function RecipeFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tags, setTags] = useState<string[]>([])

  useEffect(() => {
    async function fetchTags() {
      try {
        const r = await fetch('/api/tags', {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
        })
        const data: { firstClass: string[]; custom: { name: string }[] } = await r.json()
        setTags([...(data.firstClass ?? []), ...(data.custom ?? []).map((t) => t.name)])
      } catch {}
    }
    fetchTags()
  }, [])

  function handleChange(param: 'category' | 'tag', value: string) {
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    if (value) {
      current.set(param, value)
    } else {
      current.delete(param)
    }
    router.push(`/recipes?${current.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-3">
      <select
        className="border border-stone-300 rounded px-3 py-1.5 text-sm text-stone-700 bg-white focus:outline-none focus:ring-2 focus:ring-sage-500"
        value={searchParams.get('category') ?? ''}
        onChange={(e) => handleChange('category', e.target.value)}
        aria-label="Filter by category"
      >
        {FILTER_CATEGORY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <select
        className="border border-stone-300 rounded px-3 py-1.5 text-sm text-stone-700 bg-white focus:outline-none focus:ring-2 focus:ring-sage-500"
        value={searchParams.get('tag') ?? ''}
        onChange={(e) => handleChange('tag', e.target.value)}
        aria-label="Filter by tag"
      >
        <option value="">All Tags</option>
        {tags.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  )
}
