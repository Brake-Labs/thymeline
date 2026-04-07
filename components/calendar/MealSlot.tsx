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
  dessert:   'Dessert',
}

interface MealSlotProps {
  mealType:        MealType
  date?:           string   // YYYY-MM-DD; when provided enables the "▶ Cook" link
  entries:         PlanEntry[]
  onAdd:           (recipeId: string, recipeTitle: string, isSideDish?: boolean, parentEntryId?: string, mealTypeOverride?: MealType) => void
  onDelete:        (entryId: string) => void
  onAddSideDish:   (parentEntryId: string) => void
  isSwapMode?:     boolean
  selectedEntryId?: string | null
  onMealTap?:      (entryId: string) => void
}

interface MealItemProps {
  entry:           PlanEntry
  indented:        boolean
  onDelete:        (id: string) => void
  isSwapMode?:     boolean
  isSelected?:     boolean
  onTap?:          (id: string) => void
}

function MealItem({ entry, indented, onDelete, isSwapMode, isSelected, onTap }: MealItemProps) {
  const ringClass = isSwapMode
    ? isSelected
      ? 'ring-2 ring-sage-500 cursor-pointer'
      : 'ring-1 ring-stone-300 cursor-pointer'
    : ''

  const inner = (
    <>
      <span className="text-xs font-display font-medium text-sage-900 truncate block leading-snug">
        {entry.recipe_title}
      </span>
      {entry.total_time_minutes != null && (
        <span className="text-[10px] font-sans text-stone-500 block mt-0.5">
          · {formatMinutes(entry.total_time_minutes)}
        </span>
      )}
    </>
  )

  return (
    <div
      className={`relative flex items-center justify-between gap-2 py-1 px-2 bg-sage-50 border-l-2 border-l-sage-500 rounded-r group mb-1 ${indented ? 'ml-4' : ''} ${ringClass}`}
      onClick={isSwapMode && onTap ? () => onTap(entry.id) : undefined}
    >
      {isSelected && (
        <span className="absolute top-0.5 right-0.5 text-[10px] text-sage-600 font-bold leading-none">✓</span>
      )}
      {isSwapMode ? (
        <div className="flex-1 min-w-0">{inner}</div>
      ) : (
        <Link href={`/recipes/${entry.recipe_id}`} className="flex-1 min-w-0">
          {inner}
        </Link>
      )}
      {!isSwapMode && (
        <button
          onClick={() => onDelete(entry.id)}
          aria-label={`Remove ${entry.recipe_title}`}
          className="text-stone-300 hover:text-terra-500 transition-colors opacity-0 group-hover:opacity-100 text-base leading-none flex-shrink-0"
        >
          ×
        </button>
      )}
    </div>
  )
}

export default function MealSlot({ mealType, date, entries, onAdd, onDelete, isSwapMode, selectedEntryId, onMealTap }: MealSlotProps) {
  const [vaultOpen, setVaultOpen] = useState(false)
  const [sideDishVaultForParent, setSideDishVaultForParent] = useState<string | null>(null)
  const [dessertVaultForParent, setDessertVaultForParent] = useState<string | null>(null)

  const canHaveSideDishes = mealType === 'dinner' || mealType === 'lunch'
  const mainEntries = entries.filter((e) => !e.is_side_dish)
  const hasMainEntry = mainEntries.length > 0
  const hasCookableSide = entries.some((e) => e.is_side_dish && e.meal_type !== 'dessert')

  return (
    <div className="mb-4 last:mb-0">
      {/* Slot header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-display font-bold uppercase tracking-[0.1em] text-sage-500">
          {MEAL_TYPE_LABELS[mealType]}
        </span>
        <div className="flex items-center gap-1.5">
          {hasMainEntry && date && (
            <Link
              href={
                mainEntries.length === 1 && !hasCookableSide
                  ? `/recipes/${mainEntries[0]!.recipe_id}/cook`
                  : `/meal/${date}?meal_type=${mealType}`
              }
              className="text-[10px] font-medium text-sage-600 bg-sage-50 border border-sage-200 hover:bg-sage-100 px-2 py-0.5 rounded transition-colors"
              aria-label={`Cook ${MEAL_TYPE_LABELS[mealType]}`}
            >
              Cook
            </Link>
          )}
          <button
            onClick={() => setVaultOpen(true)}
            aria-label={`Add ${MEAL_TYPE_LABELS[mealType]}`}
            className="text-xs border border-sage-200 text-sage-500 hover:bg-sage-50 px-2 py-0.5 rounded transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* Main entries */}
      {mainEntries.map((entry) => {
        const sideDishes = entries.filter((e) => e.is_side_dish && e.meal_type !== 'dessert' && e.parent_entry_id === entry.id)
        const dessertEntries = entries.filter((e) => e.meal_type === 'dessert' && e.parent_entry_id === entry.id)
        return (
          <div key={entry.id}>
            <MealItem
              entry={entry}
              indented={false}
              onDelete={onDelete}
              isSwapMode={isSwapMode && !entry.is_side_dish}
              isSelected={selectedEntryId === entry.id}
              onTap={onMealTap}
            />

            {sideDishes.map((sd) => (
              <MealItem key={sd.id} entry={sd} indented onDelete={onDelete} />
            ))}

            {dessertEntries.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 py-1 px-2 ml-4 bg-sage-50 border-l-2 border-l-sage-500 rounded-r group mb-1">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.1em] text-sage-500 flex-shrink-0">
                    Dessert
                  </span>
                  <Link href={`/recipes/${d.recipe_id}`} className="text-xs font-display font-medium text-sage-900 truncate">
                    {d.recipe_title}
                  </Link>
                </div>
                <button
                  onClick={() => onDelete(d.id)}
                  aria-label={`Remove ${d.recipe_title}`}
                  className="text-stone-300 hover:text-terra-500 transition-colors opacity-0 group-hover:opacity-100 text-base leading-none flex-shrink-0"
                >
                  ×
                </button>
              </div>
            ))}

            {/* Add side dish + dessert links */}
            {canHaveSideDishes && (
              <div className="flex gap-3 pl-2 mb-1">
                <button
                  onClick={() => setSideDishVaultForParent(entry.id)}
                  className="text-[11px] font-sans text-sage-500 hover:text-sage-600 hover:underline transition-colors"
                >
                  Add side dish
                </button>
                <button
                  onClick={() => setDessertVaultForParent(entry.id)}
                  className="text-[11px] font-sans text-sage-500 hover:text-sage-600 hover:underline transition-colors"
                >
                  Add dessert
                </button>
              </div>
            )}
          </div>
        )
      })}

      {!hasMainEntry && (
        <p className="font-sans text-xs text-stone-300 italic px-2">—</p>
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

      {dessertVaultForParent && (
        <VaultSearchSheet
          forDate=""
          mealType="dessert"
          onAssign={({ recipe_id, recipe_title }) => {
            onAdd(recipe_id, recipe_title, true, dessertVaultForParent, 'dessert')
            setDessertVaultForParent(null)
          }}
          onClose={() => setDessertVaultForParent(null)}
        />
      )}
    </div>
  )
}
