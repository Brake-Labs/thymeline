'use client'

import Link from 'next/link'
import type { RecipeListItem } from '@/types'
import { CATEGORY_LABELS } from '@/lib/category-labels'
import { formatMinutes } from '@/lib/format-time'
import { MAX_VISIBLE_TAGS } from '@/lib/constants'

export type ListSortKey = 'title' | 'category' | 'total_time_minutes' | 'last_made' | null

interface RecipeListViewProps {
  recipes: RecipeListItem[]
  selectedIds: Set<string>
  onSelect: (id: string, selected: boolean) => void
  onSelectAll: (selected: boolean) => void
  sortKey: ListSortKey
  sortDir: 'asc' | 'desc' | null
  onSort: (key: ListSortKey) => void
  currentUserId: string | undefined
}

const COLUMNS: { key: ListSortKey; label: string; className: string }[] = [
  { key: 'title', label: 'Recipe', className: 'flex-1 min-w-0' },
  { key: 'category', label: 'Category', className: 'w-28' },
  { key: null, label: 'Tags', className: 'w-36' },
  { key: 'total_time_minutes', label: 'Time', className: 'w-20' },
  { key: 'last_made', label: 'Last Made', className: 'w-24' },
  { key: null, label: '', className: 'w-12' },
]

function SortArrow({ dir }: { dir: 'asc' | 'desc' | null }) {
  if (!dir) return <span className="text-stone-300 ml-1">↕</span>
  return <span className="text-sage-600 ml-1">{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function RecipeListView({
  recipes,
  selectedIds,
  onSelect,
  onSelectAll,
  sortKey,
  sortDir,
  onSort,
  currentUserId,
}: RecipeListViewProps) {
  const allSelected = recipes.length > 0 && recipes.every((r) => selectedIds.has(r.id))

  function handleHeaderSort(key: ListSortKey) {
    if (key === null) return
    onSort(key)
  }

  if (recipes.length === 0) {
    return (
      <div className="py-16 text-center text-stone-400 text-sm">No recipes found.</div>
    )
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="w-8 pb-2 text-left">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="accent-sage-500"
                aria-label="Select all"
              />
            </th>
            {COLUMNS.map(({ key, label, className }) => (
              <th
                key={`${key ?? ''}-${label}`}
                className={`pb-2 text-left text-[11px] font-semibold uppercase tracking-wider text-stone-400 ${className} ${key ? 'cursor-pointer select-none hover:text-stone-600' : ''}`}
                onClick={() => handleHeaderSort(key)}
              >
                {label}
                {key && <SortArrow dir={sortKey === key ? sortDir : null} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {recipes.map((recipe) => {
            const isOwner = currentUserId && recipe.user_id === currentUserId
            const visibleTags = recipe.tags.slice(0, MAX_VISIBLE_TAGS)
            const extraCount = recipe.tags.length - MAX_VISIBLE_TAGS

            return (
              <tr
                key={recipe.id}
                className={`border-b border-stone-100 hover:bg-stone-50 transition-colors ${
                  selectedIds.has(recipe.id) ? 'bg-sage-50' : ''
                }`}
              >
                <td className="py-3 pr-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(recipe.id)}
                    onChange={(e) => onSelect(recipe.id, e.target.checked)}
                    className="accent-sage-500"
                    aria-label={`Select ${recipe.title}`}
                  />
                </td>
                <td className="py-3 pr-4 flex-1 min-w-0">
                  <Link
                    href={`/recipes/${recipe.id}`}
                    className="font-medium text-[#1F2D26] hover:text-sage-700 truncate block"
                  >
                    {recipe.title}
                  </Link>
                </td>
                <td className="py-3 pr-4 w-28 text-stone-500 text-xs">
                  {CATEGORY_LABELS[recipe.category]}
                </td>
                <td className="py-3 pr-4 w-36">
                  <div className="flex flex-wrap gap-1">
                    {visibleTags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-sage-50 text-sage-700 border border-sage-200"
                      >
                        {tag}
                      </span>
                    ))}
                    {extraCount > 0 && (
                      <span className="text-[10px] text-stone-400">+{extraCount}</span>
                    )}
                  </div>
                </td>
                <td className="py-3 pr-4 w-20 text-xs text-stone-500">
                  {formatMinutes(recipe.total_time_minutes)}
                </td>
                <td className="py-3 pr-4 w-24 text-xs text-stone-500">
                  {recipe.last_made ?? 'Never'}
                </td>
                <td className="py-3 w-12">
                  {isOwner && (
                    <Link
                      href={`/recipes/${recipe.id}/edit`}
                      className="text-xs text-stone-400 hover:text-stone-600"
                    >
                      Edit
                    </Link>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
