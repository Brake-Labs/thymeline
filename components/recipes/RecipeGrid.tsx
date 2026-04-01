'use client'

import type { RecipeListItem } from '@/types'
import RecipeCard from './RecipeCard'

interface RecipeGridProps {
  recipes: RecipeListItem[]
  selectedIds: Set<string>
  onSelect: (id: string, selected: boolean) => void
  currentUserId: string | undefined
  loading?: boolean
}

function SkeletonCard() {
  return (
    <div className="flex flex-col bg-stone-50 rounded border border-stone-200 overflow-hidden animate-pulse">
      <div className="h-[3px] bg-stone-200" />
      <div className="p-4 flex-1 space-y-2">
        <div className="h-2 bg-stone-200 rounded w-1/3" />
        <div className="h-4 bg-stone-200 rounded w-3/4" />
        <div className="h-3 bg-stone-200 rounded w-1/4" />
        <div className="flex gap-1 mt-3">
          <div className="h-4 bg-stone-200 rounded-full w-12" />
          <div className="h-4 bg-stone-200 rounded-full w-16" />
        </div>
      </div>
      <div className="h-7 bg-stone-100 border-t border-dashed border-stone-200" />
    </div>
  )
}

export default function RecipeGrid({
  recipes,
  selectedIds,
  onSelect,
  currentUserId,
  loading = false,
}: RecipeGridProps) {
  const selectionMode = selectedIds.size > 0

  if (loading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
        {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  if (recipes.length === 0) {
    return (
      <div className="py-16 text-center text-stone-400 text-sm">
        No recipes found.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          selected={selectedIds.has(recipe.id)}
          onSelect={onSelect}
          selectionMode={selectionMode}
          currentUserId={currentUserId}
        />
      ))}
    </div>
  )
}
