'use client'

import Link from 'next/link'
import { useState } from 'react'
import VaultSearchSheet from '@/components/plan/VaultSearchSheet'
import { formatMinutes } from '@/lib/format-time'
import type { PlanEntry, MealType } from '@/types'

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch:     'Lunch',
  dinner:    'Dinner',
  snack:     'Snacks',
}

interface MealSlotProps {
  mealType:       MealType
  entries:        PlanEntry[]
  onAdd:          (recipeId: string, recipeTitle: string, isSideDish?: boolean, parentEntryId?: string) => void
  onDelete:       (entryId: string) => void
  onAddSideDish:  (parentEntryId: string) => void
}

export default function MealSlot({ mealType, entries, onAdd, onDelete, onAddSideDish }: MealSlotProps) {
  const [vaultOpen, setVaultOpen] = useState(false)
  const [sideDishVaultForParent, setSideDishVaultForParent] = useState<string | null>(null)

  const canHaveSideDishes = mealType === 'dinner' || mealType === 'lunch'
  const mainEntries = entries.filter((e) => !e.is_side_dish)
  const hasMainEntry = mainEntries.length > 0

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
          {MEAL_TYPE_LABELS[mealType]}
        </span>
        <button
          onClick={() => setVaultOpen(true)}
          aria-label={`Add ${MEAL_TYPE_LABELS[mealType]}`}
          className="text-xs text-sage-500 hover:text-sage-600 font-medium px-2 py-0.5 rounded hover:bg-sage-50 transition-colors"
        >
          +
        </button>
      </div>

      {/* Main entries */}
      {mainEntries.map((entry) => {
        const sideDishes = entries.filter((e) => e.is_side_dish && e.parent_entry_id === entry.id)
        return (
          <div key={entry.id} className="mb-1">
            {/* Main dish */}
            <div className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg hover:bg-stone-50 group">
              <Link
                href={`/recipes/${entry.recipe_id}`}
                className="text-sm text-stone-800 hover:text-sage-600 flex-1 min-w-0 transition-colors"
              >
                <span className="truncate">{entry.recipe_title}</span>
                {entry.total_time_minutes != null && (
                  <span className="text-stone-400 text-xs ml-1.5">· {formatMinutes(entry.total_time_minutes)}</span>
                )}
              </Link>
              <button
                onClick={() => onDelete(entry.id)}
                aria-label={`Remove ${entry.recipe_title}`}
                className="text-stone-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-base leading-none"
              >
                ×
              </button>
            </div>

            {/* Side dishes */}
            {sideDishes.map((sd) => (
              <div key={sd.id} className="flex items-center justify-between gap-2 py-0.5 pl-6 pr-2 rounded-lg hover:bg-stone-50 group">
                <Link
                  href={`/recipes/${sd.recipe_id}`}
                  className="text-xs text-stone-500 hover:text-sage-600 flex-1 min-w-0 transition-colors"
                >
                  <span className="truncate">{sd.recipe_title}</span>
                  {sd.total_time_minutes != null && (
                    <span className="text-stone-400 text-xs ml-1.5">· {formatMinutes(sd.total_time_minutes)}</span>
                  )}
                </Link>
                <button
                  onClick={() => onDelete(sd.id)}
                  aria-label={`Remove ${sd.recipe_title}`}
                  className="text-stone-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-base leading-none"
                >
                  ×
                </button>
              </div>
            ))}

            {/* Add side dish link */}
            {canHaveSideDishes && (
              <button
                onClick={() => setSideDishVaultForParent(entry.id)}
                className="text-xs text-stone-400 hover:text-stone-600 pl-6 underline transition-colors"
              >
                Add side dish
              </button>
            )}
          </div>
        )
      })}

      {!hasMainEntry && (
        <p className="text-xs text-stone-300 italic px-2">None planned</p>
      )}

      {/* Vault sheet for adding main entry */}
      {vaultOpen && (
        <VaultSearchSheet
          forDate=""
          mealType={mealType}
          onAssign={({ recipe_id, recipe_title }) => {
            onAdd(recipe_id, recipe_title)
            setVaultOpen(false)
          }}
          onClose={() => setVaultOpen(false)}
        />
      )}

      {/* Vault sheet for adding side dish */}
      {sideDishVaultForParent && (
        <VaultSearchSheet
          forDate=""
          mealType="snack"
          onAssign={({ recipe_id, recipe_title }) => {
            onAdd(recipe_id, recipe_title, true, sideDishVaultForParent)
            setSideDishVaultForParent(null)
          }}
          onClose={() => setSideDishVaultForParent(null)}
        />
      )}
    </div>
  )
}
