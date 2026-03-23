'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import type { RecipeListItem, RecipeFilters } from '@/types'
import RecipeGrid from '@/components/recipes/RecipeGrid'
import RecipeListView, { ListSortKey } from '@/components/recipes/RecipeListView'
import FilterPanel from '@/components/recipes/FilterPanel'
import BulkActionBar from '@/components/recipes/BulkActionBar'
import BulkTagModal from '@/components/recipes/BulkTagModal'
import AddRecipeModal from '@/components/recipes/AddRecipeModal'
import { getAccessToken, getSupabaseClient } from '@/lib/supabase/browser'

const VIEW_KEY = 'forkcast:recipe-view'

const EMPTY_FILTERS: RecipeFilters = {
  tags: [],
  categories: [],
  maxTotalMinutes: null,
  lastMadeFrom: null,
  lastMadeTo: null,
  neverMade: false,
}

function countActiveFilters(f: RecipeFilters): number {
  return (
    f.tags.length +
    f.categories.length +
    (f.maxTotalMinutes !== null ? 1 : 0) +
    (f.neverMade ? 1 : f.lastMadeFrom || f.lastMadeTo ? 1 : 0)
  )
}

function applyFiltersLocally(recipes: RecipeListItem[], f: RecipeFilters): RecipeListItem[] {
  return recipes.filter((r) => {
    if (f.tags.length > 0 && !f.tags.every((t) => r.tags.includes(t))) return false
    if (f.categories.length > 0 && !f.categories.includes(r.category)) return false
    if (f.maxTotalMinutes !== null) {
      if (r.total_time_minutes === null || r.total_time_minutes > f.maxTotalMinutes) return false
    }
    if (f.neverMade) {
      if (r.last_made !== null) return false
    } else {
      if (f.lastMadeFrom && (r.last_made === null || r.last_made < f.lastMadeFrom)) return false
      if (f.lastMadeTo && (r.last_made === null || r.last_made > f.lastMadeTo)) return false
    }
    return true
  })
}

function sortListView(
  recipes: RecipeListItem[],
  key: ListSortKey,
  dir: 'asc' | 'desc' | null,
): RecipeListItem[] {
  if (!key || !dir) return recipes
  return [...recipes].sort((a, b) => {
    let cmp = 0
    if (key === 'title') {
      cmp = a.title.localeCompare(b.title)
    } else if (key === 'category') {
      cmp = a.category.localeCompare(b.category)
    } else if (key === 'total_time_minutes') {
      const aT = a.total_time_minutes ?? Infinity
      const bT = b.total_time_minutes ?? Infinity
      cmp = aT - bT
    } else if (key === 'last_made') {
      const aD = a.last_made ?? ''
      const bD = b.last_made ?? ''
      cmp = aD.localeCompare(bD)
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

export default function RecipePageContent() {
  const [recipes, setRecipes] = useState<RecipeListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined)

  // View toggle
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ recipe_id: string; recipe_title: string }[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Filters
  const [filterOpen, setFilterOpen] = useState(false)
  const [appliedFilters, setAppliedFilters] = useState<RecipeFilters>(EMPTY_FILTERS)
  const [pendingFilters, setPendingFilters] = useState<RecipeFilters>(EMPTY_FILTERS)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkTagModal, setShowBulkTagModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // List sort (3-click cycle: null → asc → desc → null)
  const [listSortKey, setListSortKey] = useState<ListSortKey>(null)
  const [listSortDir, setListSortDir] = useState<'asc' | 'desc' | null>(null)

  // Init view mode from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY)
      if (saved === 'list' || saved === 'grid') setViewMode(saved)
    } catch {}
  }, [])

  function setAndPersistViewMode(mode: 'grid' | 'list') {
    setViewMode(mode)
    try { localStorage.setItem(VIEW_KEY, mode) } catch {}
  }

  const fetchRecipes = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/recipes', {
      headers: { Authorization: `Bearer ${await getAccessToken()}` },
    })
    if (res.ok) {
      const data: RecipeListItem[] = await res.json()
      setRecipes(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchRecipes() }, [fetchRecipes])

  useEffect(() => {
    void (async () => {
      const { data } = await getSupabaseClient().auth.getSession()
      if (data.session?.user) setCurrentUserId(data.session.user.id)
    })()
  }, [])

  const vaultTags = useMemo(() => {
    const tagSet = new Set<string>()
    recipes.forEach((r) => r.tags.forEach((t) => tagSet.add(t)))
    return Array.from(tagSet).sort()
  }, [recipes])

  const displayedRecipes = useMemo(() => {
    let base: RecipeListItem[]
    if (searchResults !== null) {
      const idToRecipe = new Map(recipes.map((r) => [r.id, r]))
      base = searchResults
        .map((sr) => idToRecipe.get(sr.recipe_id))
        .filter((r): r is RecipeListItem => r !== undefined)
      base = applyFiltersLocally(base, appliedFilters)
    } else {
      base = applyFiltersLocally(recipes, appliedFilters)
    }
    return sortListView(base, listSortKey, listSortDir)
  }, [recipes, searchResults, appliedFilters, listSortKey, listSortDir])

  async function handleSearch() {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults(null)
      return
    }
    setSearchLoading(true)
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/recipes/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: q }),
      })
      if (res.ok) {
        const data: { results: { recipe_id: string; recipe_title: string }[] } = await res.json()
        setSearchResults(data.results)
      }
    } finally {
      setSearchLoading(false)
    }
  }

  function clearSearch() {
    setSearchQuery('')
    setSearchResults(null)
    searchInputRef.current?.focus()
  }

  function handleApplyFilters() {
    setAppliedFilters(pendingFilters)
    setFilterOpen(false)
  }

  function handleClearAllFilters() {
    setPendingFilters(EMPTY_FILTERS)
    setAppliedFilters(EMPTY_FILTERS)
    setFilterOpen(false)
  }

  const activeFilterCount = countActiveFilters(appliedFilters)

  function handleSelect(id: string, selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (selected) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function handleSelectAll(selected: boolean) {
    if (selected) {
      setSelectedIds(new Set(displayedRecipes.map((r) => r.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  function clearSelection() {
    setSelectedIds(new Set())
    setShowDeleteConfirm(false)
  }

  function handleListSort(key: ListSortKey) {
    if (key === null) return
    if (listSortKey !== key) {
      setListSortKey(key)
      setListSortDir('asc')
    } else if (listSortDir === 'asc') {
      setListSortDir('desc')
    } else {
      setListSortKey(null)
      setListSortDir(null)
    }
  }

  async function handleBulkAddTags(tags: string[]) {
    const token = await getAccessToken()
    const res = await fetch('/api/recipes/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ recipe_ids: Array.from(selectedIds), add_tags: tags }),
    })
    if (!res.ok) {
      const err: { error?: string } = await res.json()
      throw new Error(err.error ?? 'Failed to add tags')
    }
    await fetchRecipes()
    clearSelection()
  }

  async function handleBulkDelete() {
    setBulkDeleting(true)
    try {
      const token = await getAccessToken()
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/recipes/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      )
      await fetchRecipes()
      clearSelection()
    } finally {
      setBulkDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-[#1F2D26]">Recipes</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-sage-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-sage-600 transition-colors"
        >
          + Add Recipe
        </button>
      </div>

      {/* Search + view toggle row */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch() }}
            placeholder="Search recipes with AI…"
            className="w-full border border-stone-200 rounded px-3 py-2 text-sm pr-16 focus:outline-none focus:ring-2 focus:ring-sage-400 bg-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-9 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={searchLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-sage-600 disabled:opacity-50"
            aria-label="Search"
          >
            {searchLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-sage-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>

        {/* Filter toggle */}
        <button
          type="button"
          onClick={() => { setFilterOpen((o) => !o); setPendingFilters(appliedFilters) }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium border transition-colors ${
            filterOpen || activeFilterCount > 0
              ? 'border-sage-500 text-sage-700 bg-sage-50'
              : 'border-stone-200 text-stone-600 bg-white hover:border-stone-300'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 text-xs font-semibold bg-sage-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* View mode toggle */}
        <div className="flex border border-stone-200 rounded overflow-hidden">
          <button
            type="button"
            onClick={() => setAndPersistViewMode('grid')}
            className={`px-3 py-2 transition-colors ${viewMode === 'grid' ? 'bg-sage-500 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
            aria-label="Grid view"
            title="Grid view"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v2.5A2.25 2.25 0 004.25 9h2.5A2.25 2.25 0 009 6.75v-2.5A2.25 2.25 0 006.75 2h-2.5zm0 9A2.25 2.25 0 002 13.25v2.5A2.25 2.25 0 004.25 18h2.5A2.25 2.25 0 009 15.75v-2.5A2.25 2.25 0 006.75 11h-2.5zm6.5-9A2.25 2.25 0 008.5 4.25v2.5A2.25 2.25 0 0010.75 9h2.5A2.25 2.25 0 0015.5 6.75v-2.5A2.25 2.25 0 0013.25 2h-2.5zm0 9A2.25 2.25 0 008.5 13.25v2.5A2.25 2.25 0 0010.75 18h2.5A2.25 2.25 0 0015.5 15.75v-2.5A2.25 2.25 0 0013.25 11h-2.5z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setAndPersistViewMode('list')}
            className={`px-3 py-2 transition-colors ${viewMode === 'list' ? 'bg-sage-500 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
            aria-label="List view"
            title="List view"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search result indicator */}
      {searchResults !== null && (
        <div className="flex items-center gap-2 mb-4 text-sm text-stone-500">
          <span>
            {searchResults.length === 0
              ? 'No results for your search'
              : `${displayedRecipes.length} result${displayedRecipes.length !== 1 ? 's' : ''} for “${searchQuery}”`}
          </span>
          <button
            type="button"
            onClick={clearSearch}
            className="text-sage-600 hover:underline text-xs"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Filter panel */}
      {filterOpen && (
        <div className="mb-5">
          <FilterPanel
            pendingFilters={pendingFilters}
            onPendingChange={setPendingFilters}
            onApply={handleApplyFilters}
            onClearAll={handleClearAllFilters}
            vaultTags={vaultTags}
          />
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4">
          {showDeleteConfirm ? (
            <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm">
              <span className="text-red-700 font-medium">
                Delete {selectedIds.size} recipe{selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-3 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-50 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleBulkDelete()}
                  disabled={bulkDeleting}
                  className="px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 text-xs font-medium"
                >
                  {bulkDeleting ? 'Deleting…' : 'Confirm delete'}
                </button>
              </div>
            </div>
          ) : (
            <BulkActionBar
              count={selectedIds.size}
              onAddTags={() => setShowBulkTagModal(true)}
              onDelete={() => setShowDeleteConfirm(true)}
              onCancel={clearSelection}
            />
          )}
        </div>
      )}

      {/* Recipe display */}
      {viewMode === 'grid' ? (
        <RecipeGrid
          recipes={displayedRecipes}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          currentUserId={currentUserId}
          loading={loading}
        />
      ) : (
        <RecipeListView
          recipes={displayedRecipes}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onSelectAll={handleSelectAll}
          sortKey={listSortKey}
          sortDir={listSortDir}
          onSort={handleListSort}
          currentUserId={currentUserId}
        />
      )}

      {/* Add recipe modal */}
      {showModal && (
        <AddRecipeModal
          onClose={() => setShowModal(false)}
          onSaved={() => void fetchRecipes()}
          getToken={getAccessToken}
        />
      )}

      {/* Bulk tag modal */}
      {showBulkTagModal && (
        <BulkTagModal
          selectedCount={selectedIds.size}
          onConfirm={handleBulkAddTags}
          onClose={() => setShowBulkTagModal(false)}
        />
      )}
    </div>
  )
}
