'use client'

import { GroceryItem } from '@/types'
import StepperInput from '@/components/preferences/StepperInput'
import GroceryItemRow from './GroceryItemRow'

interface RecipeSectionGroupProps {
  recipeTitle:       string
  recipeId:          string
  items:             GroceryItem[]
  effectiveCount:    number
  isOverridden:      boolean
  onServingsChange:  (count: number) => void
  onResetOverride:   () => void
  onToggle:          (itemId: string) => void
  onRemove:          (itemId: string) => void
  onMarkAllBought:   () => void
  onDeleteRecipe:    () => void
  onGotIt:           (itemId: string) => void
}

export default function RecipeSectionGroup({
  recipeTitle,
  recipeId,
  items,
  effectiveCount,
  isOverridden,
  onServingsChange,
  onResetOverride,
  onToggle,
  onRemove,
  onMarkAllBought,
  onDeleteRecipe,
  onGotIt,
}: RecipeSectionGroupProps) {
  // "items" here contains only unchecked items (bought are in Got it section)
  // allBought means no active items remain → show Unmark all
  const hasItems = items.length > 0

  return (
    <section
      aria-labelledby={`recipe-heading-${recipeId}`}
      className="border border-stone-200 rounded-xl bg-white overflow-hidden"
    >
      <div className="px-4 pt-4 pb-3 border-b border-stone-100 flex items-center justify-between flex-wrap gap-2">
        <h3
          id={`recipe-heading-${recipeId}`}
          className="font-display font-semibold text-stone-800 text-sm"
        >
          {recipeTitle}
        </h3>
        <div className="flex items-center gap-2">
          {hasItems && (
            <button
              type="button"
              onClick={onMarkAllBought}
              className="text-xs text-stone-500 hover:text-sage-600 underline transition-colors"
            >
              Mark all as bought
            </button>
          )}
          <button
            type="button"
            onClick={onDeleteRecipe}
            aria-label={`Remove ${recipeTitle} from list`}
            className="text-xs text-stone-400 hover:text-red-500 underline transition-colors"
          >
            Remove recipe
          </button>
          {isOverridden && (
            <>
              <span className="text-xs font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                Custom
              </span>
              <button
                type="button"
                onClick={onResetOverride}
                className="text-xs text-stone-500 hover:text-stone-800 underline"
              >
                Reset to default
              </button>
            </>
          )}
          <StepperInput
            value={effectiveCount}
            min={1}
            max={20}
            onChange={onServingsChange}
            label="Servings"
          />
        </div>
      </div>

      <div className="px-4 py-2 divide-y divide-stone-50">
        {items.length === 0 ? (
          <p className="text-sm text-stone-400 py-2">All items marked as bought</p>
        ) : (
          items.map((item) => (
            <GroceryItemRow
              key={item.id}
              item={item}
              onToggle={() => onToggle(item.id)}
              onRemove={() => onRemove(item.id)}
              onGotIt={() => onGotIt(item.id)}
            />
          ))
        )}
      </div>
    </section>
  )
}
