'use client'

import { useState } from 'react'
import Link from 'next/link'
import { RecipeListItem } from '@/types'
import { CATEGORY_LABELS } from '@/lib/category-labels'
import TagPill from './TagPill'
import DeleteConfirmDialog from './DeleteConfirmDialog'
import { getAccessToken } from '@/lib/supabase/browser'

export type SortKey = 'title' | 'category' | 'last_made'
export type SortDir = 'asc' | 'desc'

interface RecipeTableProps {
  recipes: RecipeListItem[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  currentUserId?: string
}

const MAX_VISIBLE_TAGS = 3

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300">↕</span>
  return <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function RecipeTable({ recipes, sortKey, sortDir, onSort, currentUserId }: RecipeTableProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const hasActions = !!currentUserId

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                onClick={() => onSort('title')}
              >
                Name <SortIndicator active={sortKey === 'title'} dir={sortDir} />
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                onClick={() => onSort('category')}
              >
                Category <SortIndicator active={sortKey === 'category'} dir={sortDir} />
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider"
              >
                Tags
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
                onClick={() => onSort('last_made')}
              >
                Last Made <SortIndicator active={sortKey === 'last_made'} dir={sortDir} />
              </th>
              {hasActions && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {recipes.length === 0 && (
              <tr>
                <td colSpan={hasActions ? 5 : 4} className="px-4 py-8 text-center text-gray-400">
                  No recipes found.
                </td>
              </tr>
            )}
            {recipes.map((recipe) => {
              const visibleTags = recipe.tags.slice(0, MAX_VISIBLE_TAGS)
              const extraCount = recipe.tags.length - MAX_VISIBLE_TAGS
              const isOwner = currentUserId !== undefined && recipe.user_id === currentUserId

              return (
                <tr key={recipe.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/recipes/${recipe.id}`} className="hover:underline text-blue-700">
                      {recipe.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {CATEGORY_LABELS[recipe.category]}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {visibleTags.map((tag) => (
                        <TagPill key={tag} label={tag} />
                      ))}
                      {extraCount > 0 && (
                        <span className="text-xs text-gray-400 self-center">+{extraCount} more</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {recipe.last_made ?? 'Never'}
                  </td>
                  {hasActions && (
                    <td className="px-4 py-3">
                      {isOwner && (
                        <div className="flex gap-3">
                          <Link
                            href={`/recipes/${recipe.id}/edit`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleteId(recipe.id)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {deleteId && (
        <DeleteConfirmDialog
          recipeId={deleteId}
          getToken={getAccessToken}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </>
  )
}
