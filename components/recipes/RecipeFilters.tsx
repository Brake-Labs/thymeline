'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface UserTag {
  id: string
  name: string
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'main_dish', label: 'Main Dish' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'side_dish', label: 'Side Dish' },
]

export default function RecipeFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tags, setTags] = useState<UserTag[]>([])

  useEffect(() => {
    fetch('/api/tags', {
      headers: {
        Authorization: `Bearer ${typeof window !== 'undefined' ? (window as Window & { __supabaseToken?: string }).__supabaseToken ?? '' : ''}`,
      },
    })
      .then((r) => r.json())
      .then((data: UserTag[]) => Array.isArray(data) && setTags(data))
      .catch(() => {})
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
        className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={searchParams.get('category') ?? ''}
        onChange={(e) => handleChange('category', e.target.value)}
        aria-label="Filter by category"
      >
        {CATEGORY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <select
        className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={searchParams.get('tag') ?? ''}
        onChange={(e) => handleChange('tag', e.target.value)}
        aria-label="Filter by tag"
      >
        <option value="">All Tags</option>
        {tags.map((t) => (
          <option key={t.id} value={t.name}>{t.name}</option>
        ))}
      </select>
    </div>
  )
}
