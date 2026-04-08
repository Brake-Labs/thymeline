'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { RecipeListItem, RecipeFilters } from '@/types'
import RecipeGrid from '@/components/recipes/RecipeGrid'
import RecipeListView, { ListSortKey } from '@/components/recipes/RecipeListView'
import FilterSidebar from '@/components/recipes/FilterSidebar'
import BulkActionBar from '@/components/recipes/BulkActionBar'
import BulkTagModal from '@/components/recipes/BulkTagModal'
import AddRecipeModal from '@/components/recipes/AddRecipeModal'
import GenerateRecipeModal from '@/components/recipes/GenerateRecipeModal'
import Link from 'next/link'

const VIEW_KEY = 'thymeline:recipe-view'
const FILTER_OPEN_KEY = 'thymeline:filter-sidebar'

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
      if (r.totalTimeMinutes === null || r.totalTimeMinutes > f.maxTotalMinutes) return false
    }
    if (f.neverMade) {
      if (r.lastMade !== null) return false
    } else {
      if (f.lastMadeFrom && (r.lastMade === null || r.lastMade < f.lastMadeFrom)) return false
      if (f.lastMadeTo && (r.lastMade === null || r.lastMade > f.lastMadeTo)) return false
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
    } else if (key === 'totalTimeMinutes') {
      const aT = a.totalTimeMinutes ?? Infinity
      const bT = b.totalTimeMinutes ?? Infinity
      cmp = aT - bT
    } else if (key === 'lastMade') {
      const aD = a.lastMade ?? ''
      const bD = b.lastMade ?? ''
      cmp = aD.localeCompare(bD)
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

const VALID_SORT_KEYS = new Set(['title', 'category', 'totalTimeMinutes', 'lastMade'])
const VALID_SORT_DIRS = new Set(['asc', 'desc'])

function parseSortParams(params: URLSearchParams): { key: ListSortKey; dir: 'asc' | 'desc' | null } {
  const sort = params.get('sort')
  const dir = params.get('dir')
  if (sort && VALID_SORT_KEYS.has(sort) && dir && VALID_SORT_DIRS.has(dir)) {
    return { key: sort as ListSortKey, dir: dir as 'asc' | 'desc' }
  }
  return { key: null, dir: null }
}

export default function RecipePageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [recipes, setRecipes] = useState<RecipeListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addModalTab, setAddModalTab] = useState<'url' | 'manual'>('url')
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showAddDropdown, setShowAddDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined)

  // View toggle
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ recipeId: string; recipeTitle: string }[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [filters, setFilters] = useState<RecipeFilters>(EMPTY_FILTERS)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkTagModal, setShowBulkTagModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // List sort — persisted in URL as ?sort=<key>&dir=<asc|desc>
  const { key: listSortKey, dir: listSortDir } = parseSortParams(searchParams)

  // Init view mode and sidebar state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY)
      if (saved === 'list' || saved === 'grid') setViewMode(saved)
      const sidebarSaved = localStorage.getItem(FILTER_OPEN_KEY)
      if (sidebarSaved === 'true') setSidebarOpen(true)
    } catch {}
  }, [])

  function setAndPersistViewMode(mode: 'grid' | 'list') {
    setViewMode(mode)
    try { localStorage.setItem(VIEW_KEY, mode) } catch {}
  }

  function toggleSidebar() {
    setSidebarOpen((o) => {
      try { localStorage.setItem(FILTER_OPEN_KEY, String(!o)) } catch {}
      return !o
    })
  }

  const fetchRecipes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/recipes')
      if (res.ok) {
        const data: RecipeListItem[] = await res.json()
        setRecipes(data)
        setFetchError(null)
      } else {
        setFetchError('Something went wrong loading your recipes.')
      }
    } catch (err) {
      setFetchError('Something went wrong loading your recipes.')
      console.error(err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchRecipes() }, [fetchRecipes])

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/auth/session')
        if (res.ok) {
          const data = await res.json()
          if (data.user?.id) setCurrentUserId(data.user.id)
        }
      } catch { /* ignore */ }
    })()
  }, [])

  useEffect(() => {
    if (!showAddDropdown) return
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAddDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAddDropdown])

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
        .map((sr) => idToRecipe.get(sr.recipeId))
        .filter((r): r is RecipeListItem => r !== undefined)
      base = applyFiltersLocally(base, filters)
    } else {
      base = applyFiltersLocally(recipes, filters)
    }
    return sortListView(base, listSortKey, listSortDir)
  }, [recipes, searchResults, filters, listSortKey, listSortDir])

  async function handleSearch() {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults(null)
      setSearchError(null)
      return
    }
    setSearchLoading(true)
    setSearchError(null)
    try {
      const res = await fetch('/api/recipes/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      if (res.ok) {
        const data: { results: { recipeId: string; recipeTitle: string }[] } = await res.json()
        setSearchResults(data.results)
      } else {
        setSearchError('Search failed. Please try again.')
      }
    } catch (err) {
      setSearchError('Search failed. Please try again.')
      console.error(err)
    } finally {
      setSearchLoading(false)
    }
  }

  function clearSearch() {
    setSearchQuery('')
    setSearchResults(null)
    setSearchError(null)
    searchInputRef.current?.focus()
  }

  function handleClearAllFilters() {
    setFilters(EMPTY_FILTERS)
  }

  async function handleDeleteCustomTag(tagName: string) {
    const res = await fetch(`/api/tags/${encodeURIComponent(tagName)}`, {
      method: 'DELETE',
    })
    if (res.ok || res.status === 204) {
      await fetchRecipes()
    }
  }

  const activeFilterCount = countActiveFilters(filters)

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
    const params = new URLSearchParams(searchParams.toString())
    if (listSortKey !== key) {
      params.set('sort', key)
      params.set('dir', 'asc')
    } else if (listSortDir === 'asc') {
      params.set('sort', key)
      params.set('dir', 'desc')
    } else {
      params.delete('sort')
      params.delete('dir')
    }
    router.replace(`?${params.toString()}`)
  }

  async function handleBulkAddTags(tags: string[]) {
    const res = await fetch('/api/recipes/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeIds: Array.from(selectedIds), addTags: tags }),
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
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/recipes/${id}`, {
            method: 'DELETE',
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
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-6">
        {/* Filters toggle */}
        <button
          type="button"
          onClick={toggleSidebar}
          className={`flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium border transition-colors ${
            sidebarOpen || activeFilterCount > 0
              ? 'border-sage-500 text-sage-700 bg-sage-50'
              : 'border-stone-200 text-stone-600 bg-white hover:border-stone-300'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 002 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
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

        <div className="flex-1" />

        {/* Search */}
        <div className="relative max-w-sm w-64">
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

        {/* Add Recipe dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setShowAddDropdown((o) => !o)}
            className="flex items-center gap-1.5 bg-sage-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-sage-600 transition-colors whitespace-nowrap"
          >
            + Add Recipe
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {showAddDropdown && (
            <div className="absolute right-0 mt-1 w-48 bg-white border border-stone-200 rounded shadow-lg z-50 py-1">
              <button
                onClick={() => { setAddModalTab('url'); setShowAddModal(true); setShowAddDropdown(false) }}
                className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-sage-50 transition-colors"
              >
                Add from URL
              </button>
              <button
                onClick={() => { setAddModalTab('manual'); setShowAddModal(true); setShowAddDropdown(false) }}
                className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-sage-50 transition-colors"
              >
                Add Manually
              </button>
              <button
                onClick={() => { setShowGenerateModal(true); setShowAddDropdown(false) }}
                className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-sage-50 transition-colors flex items-center gap-1.5"
              >
                <span className="text-sage-500">✦</span>
                Generate with AI
              </button>
              <Link
                href="/import"
                onClick={() => setShowAddDropdown(false)}
                className="block px-4 py-2 text-sm text-stone-700 hover:bg-sage-50 transition-colors"
              >
                Import Recipes
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Search error */}
      {searchError && (
        <p className="text-red-500 text-sm mt-2 mb-4">{searchError}</p>
      )}

      {/* Fetch error */}
      {fetchError && (
        <p className="text-red-500 text-sm mt-2 mb-4">{fetchError}</p>
      )}

      {/* Search result indicator */}
      {searchResults !== null && (
        <div className="flex items-center gap-2 mb-4 text-sm text-stone-500">
          <span>
            {searchResults.length === 0
              ? 'No results for your search'
              : `${displayedRecipes.length} result${displayedRecipes.length !== 1 ? 's' : ''} for "${searchQuery}"`}
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

      {/* Body: sidebar + recipes */}
      <div className="flex gap-6 items-start">
        {/* Filter sidebar */}
        {sidebarOpen && (
          <aside className="w-56 shrink-0">
            <FilterSidebar
              filters={filters}
              onChange={setFilters}
              onClearAll={handleClearAllFilters}
              vaultTags={vaultTags}
              activeCount={activeFilterCount}
              onDeleteTag={handleDeleteCustomTag}
            />
          </aside>
        )}

        {/* Recipe display */}
        <div className="flex-1 min-w-0">
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
        </div>
      </div>

      {/* Add recipe modal */}
      {showAddModal && (
        <AddRecipeModal
          initialTab={addModalTab}
          onClose={() => setShowAddModal(false)}
          onSaved={() => void fetchRecipes()}
        />
      )}

      {/* Generate recipe modal */}
      {showGenerateModal && (
        <GenerateRecipeModal
          onClose={() => setShowGenerateModal(false)}
          onSaved={() => void fetchRecipes()}
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
