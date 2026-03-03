'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { RecipeListItem } from '@/types'
import RecipeTable, { SortKey, SortDir } from '@/components/recipes/RecipeTable'
import RecipeFilters from '@/components/recipes/RecipeFilters'
import AddRecipeModal from '@/components/recipes/AddRecipeModal'
import { getAccessToken } from '@/lib/supabase/browser'

function sortRecipes(
  recipes: RecipeListItem[],
  key: SortKey,
  dir: SortDir,
): RecipeListItem[] {
  return [...recipes].sort((a, b) => {
    let cmp = 0
    if (key === 'title') {
      cmp = a.title.localeCompare(b.title)
    } else if (key === 'category') {
      cmp = a.category.localeCompare(b.category)
    } else if (key === 'last_made') {
      const aDate = a.last_made ?? ''
      const bDate = b.last_made ?? ''
      cmp = aDate.localeCompare(bDate)
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

export default function RecipePageContent() {
  const searchParams = useSearchParams()
  const [recipes, setRecipes] = useState<RecipeListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const category = searchParams.get('category') ?? ''
  const tag = searchParams.get('tag') ?? ''

  const fetchRecipes = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (tag) params.set('tag', tag)

    const res = await fetch(`/api/recipes?${params.toString()}`, {
      headers: { Authorization: `Bearer ${await getAccessToken()}` },
    })
    if (res.ok) {
      const data: RecipeListItem[] = await res.json()
      setRecipes(data)
    }
    setLoading(false)
  }, [category, tag])

  useEffect(() => {
    fetchRecipes()
  }, [fetchRecipes])

  useEffect(() => {
    async function fetchTags() {
      try {
        const r = await fetch('/api/tags', { headers: { Authorization: `Bearer ${await getAccessToken()}` } })
        const data: { id: string; name: string }[] = await r.json()
        if (Array.isArray(data)) setAvailableTags(data.map((t) => t.name))
      } catch {}
    }
    fetchTags()
  }, [])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = sortRecipes(recipes, sortKey, sortDir)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recipes</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
        >
          + Add Recipe
        </button>
      </div>

      <div className="mb-4">
        <RecipeFilters />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <RecipeTable
          recipes={sorted}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      )}

      {showModal && (
        <AddRecipeModal
          availableTags={availableTags}
          onClose={() => setShowModal(false)}
          onSaved={() => fetchRecipes()}
          getToken={getAccessToken}
        />
      )}
    </div>
  )
}
