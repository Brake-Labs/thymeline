'use client'

import Link from 'next/link'
import { RecipeListItem } from '@/types'
import { CATEGORY_LABELS } from '@/lib/category-labels'
import TagPill from './TagPill'

export type SortKey = 'title' | 'category' | 'last_made'
export type SortDir = 'asc' | 'desc'

interface RecipeTableProps {
  recipes: RecipeListItem[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
}

const MAX_VISIBLE_TAGS = 3

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="ml-1 text-gray-300">↕</span>
  return <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function RecipeTable({ recipes, sortKey, sortDir, onSort }: RecipeTableProps) {
  return (
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
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {recipes.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                No recipes found.
              </td>
            </tr>
          )}
          {recipes.map((recipe) => {
            const visibleTags = recipe.tags.slice(0, MAX_VISIBLE_TAGS)
            const extraCount = recipe.tags.length - MAX_VISIBLE_TAGS

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
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
