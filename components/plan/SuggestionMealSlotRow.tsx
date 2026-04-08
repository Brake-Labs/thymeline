'use client'

import { useState } from 'react'
import { Leaf } from 'lucide-react'
import AssignDayPicker from './AssignDayPicker'
import VaultSearchSheet from './VaultSearchSheet'
import type { RecipeSuggestion, DaySelection, MealType } from '@/types'

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch:     'Lunch',
  dinner:    'Dinner',
  snack:     'Snacks',
  dessert:   'Dessert',
}

interface SuggestionMealSlotRowProps {
  date:         string
  mealType:     MealType
  options:      RecipeSuggestion[]
  selection:    DaySelection | null | undefined
  isSwapping:   boolean
  activeDates:  string[]
  onSelect:     (date: string, mealType: MealType, recipe: RecipeSuggestion) => void
  onSkip:       (date: string, mealType: MealType) => void
  onSwap:       (date: string, mealType: MealType) => void
  onAssignToDay:(recipe: RecipeSuggestion, sourceDate: string, targetDate: string, mealType: MealType) => void
  onVaultPick:  (date: string, mealType: MealType, recipe: { recipeId: string; recipeTitle: string }) => void
  onFreeTextMatch:(query: string, date: string, mealType: MealType) => Promise<{ matched: boolean }>
  onSideDishPick?:  (date: string, mealType: MealType, recipe: { recipeId: string; recipeTitle: string }) => void
  onSideDishRemove?:(date: string, mealType: MealType) => void
  onDessertPick?:   (date: string, mealType: MealType, recipe: { recipeId: string; recipeTitle: string }) => void
  onDessertRemove?: (date: string, mealType: MealType) => void
}

export default function SuggestionMealSlotRow({
  date, mealType, options, selection, isSwapping, activeDates,
  onSelect, onSkip, onSwap, onAssignToDay, onVaultPick, onFreeTextMatch,
  onSideDishPick, onSideDishRemove, onDessertPick, onDessertRemove,
}: SuggestionMealSlotRowProps) {
  const [assignOpen, setAssignOpen] = useState<string | null>(null)
  const [assignRecipe, setAssignRecipe] = useState<RecipeSuggestion | null>(null)
  const [vaultOpen, setVaultOpen] = useState(false)
  const [freeTextExpanded, setFreeTextExpanded] = useState(false)
  const [freeTextQuery, setFreeTextQuery] = useState('')
  const [freeTextLoading, setFreeTextLoading] = useState(false)
  const [freeTextError, setFreeTextError] = useState('')
  const [sideDishVaultOpen, setSideDishVaultOpen] = useState(false)
  const [sideDishEntry, setSideDishEntry] = useState<{ recipeId: string; recipeTitle: string } | null>(null)
  const [dessertVaultOpen, setDessertVaultOpen] = useState(false)
  const [dessertEntry, setDessertEntry] = useState<{ recipeId: string; recipeTitle: string } | null>(null)
  const isSkipped = selection === null
  const isSelected = (recipeId: string) => selection?.recipeId === recipeId
  const canHaveDessert = mealType === 'dinner' || mealType === 'lunch'
  const hasSelection = selection !== null && selection !== undefined

  const handleFreeTextSubmit = async () => {
    if (!freeTextQuery.trim()) return
    setFreeTextLoading(true)
    setFreeTextError('')
    const result = await onFreeTextMatch(freeTextQuery.trim(), date, mealType)
    setFreeTextLoading(false)
    if (!result.matched) {
      setFreeTextError("Couldn\u2019t find that in your recipe box \u2014 try searching")
      setVaultOpen(true)
    } else {
      setFreeTextExpanded(false)
      setFreeTextQuery('')
    }
  }

  return (
    <div className="border border-stone-100 rounded-lg overflow-hidden mb-2 last:mb-0">
      {/* Slot header */}
      <div className="flex items-center justify-between px-3 py-2 bg-stone-50/80 border-b border-stone-100">
        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
          {MEAL_TYPE_LABELS[mealType]}
        </span>
        <div className="flex gap-2">
          {!isSkipped && (
            <button
              onClick={() => onSwap(date, mealType)}
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-0.5 rounded hover:bg-stone-100 transition-colors"
            >
              Swap
            </button>
          )}
          {!isSkipped ? (
            <button
              onClick={() => onSkip(date, mealType)}
              className="text-xs text-stone-500 hover:text-stone-700 px-2 py-0.5 rounded hover:bg-stone-100 transition-colors"
            >
              Skip this slot
            </button>
          ) : (
            <span className="text-xs text-stone-400">
              Skipping this slot{' '}
              <button
                onClick={() => onSkip(date, mealType)}
                className="underline hover:text-stone-600"
              >
                Undo
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {isSkipped ? (
        <div className="px-3 py-2">
          <p className="text-sm text-stone-400 italic">Skipping this slot</p>
        </div>
      ) : isSwapping ? (
        <div className="px-3 py-3 space-y-2 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-stone-100 rounded" />
          ))}
        </div>
      ) : (
        <div>
          {/* Vault/free-text selection not in the options list — show it as the selected row */}
          {selection && !options.some((o) => o.recipeId === selection.recipeId) && (
            <div className="border-b border-stone-50 px-3 py-2.5 border-l-4 border-l-sage-500 bg-sage-50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 truncate">{selection.recipeTitle}</p>
                  <p className="text-xs text-stone-400 italic mt-0.5">From your recipe box</p>
                </div>
                <button
                  onClick={() => onSelect(date, mealType, { recipeId: selection.recipeId, recipeTitle: selection.recipeTitle })}
                  title="Deselect"
                  className="text-sage-500 flex-shrink-0 hover:text-stone-400 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {options.length === 0 ? (
            <div className="px-3 py-2">
              <p className="text-sm text-stone-400">No suggestions — try swapping or searching your recipe box.</p>
            </div>
          ) : (
            options.map((opt) => {
              const selected = isSelected(opt.recipeId)
              return (
                <div
                  key={opt.recipeId}
                  className={[
                    'border-b border-stone-50 last:border-0 px-3 py-2.5 transition-colors',
                    selected ? 'border-l-4 border-l-sage-500 bg-sage-50' : '',
                    !selected && selection !== undefined ? 'opacity-60' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">{opt.recipeTitle}</p>
                      {opt.reason && (
                        <p className="text-xs text-stone-400 italic mt-0.5">{opt.reason}</p>
                      )}
                      {opt.wasteBadgeText && (
                        <div
                          className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: '#FFF0C0', color: '#5C4A00' }}
                        >
                          <Leaf size={10} className="flex-shrink-0" />
                          {opt.wasteBadgeText}
                        </div>
                      )}
                    </div>
                    {selected ? (
                      <button
                        onClick={() => onSelect(date, mealType, opt)}
                        title="Deselect"
                        className="text-sage-500 flex-shrink-0 hover:text-stone-400 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        onClick={() => onSelect(date, mealType, opt)}
                        className="text-xs font-medium text-sage-500 border border-sage-300 px-2.5 py-1 rounded-lg hover:bg-sage-50 flex-shrink-0 transition-colors"
                      >
                        Select
                      </button>
                    )}
                  </div>

                  {/* Assign to different day */}
                  <div className="mt-1">
                    <button
                      onClick={() => {
                        setAssignRecipe(opt)
                        setAssignOpen(assignOpen === opt.recipeId ? null : opt.recipeId)
                      }}
                      className="text-xs text-stone-400 hover:text-stone-600 underline transition-colors"
                    >
                      Use for a different day
                    </button>
                  </div>

                  {/* From recipe box badge */}
                  {selected && selection?.fromVault && (
                    <span className="text-xs text-stone-400 mt-1 block">From recipe box</span>
                  )}
                </div>
              )
            })
          )}

          {/* Side dish add-on — shown when a main recipe is selected for dinner/lunch */}
          {canHaveDessert && hasSelection && (
            <div className="px-3 py-2 border-t border-stone-50">
              {sideDishEntry ? (
                <div className="flex items-center gap-2 pl-4">
                  <span className="text-xs font-medium text-stone-400 flex-shrink-0">Side dish</span>
                  <span className="text-xs text-stone-600 flex-1 truncate">{sideDishEntry.recipeTitle}</span>
                  <button
                    onClick={() => {
                      setSideDishEntry(null)
                      onSideDishRemove?.(date, mealType)
                    }}
                    aria-label="Remove side dish"
                    className="text-stone-300 hover:text-red-400 transition-colors text-base leading-none"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSideDishVaultOpen(true)}
                  className="text-xs text-stone-400 hover:text-stone-600 pl-4 underline transition-colors"
                >
                  Add side dish
                </button>
              )}
            </div>
          )}

          {/* Dessert add-on — shown when a main recipe is selected for dinner/lunch */}
          {canHaveDessert && hasSelection && (
            <div className="px-3 py-2 border-t border-stone-50">
              {dessertEntry ? (
                <div className="flex items-center gap-2 pl-4">
                  <span className="text-xs font-medium text-stone-400 flex-shrink-0">Dessert</span>
                  <span className="text-xs text-stone-600 flex-1 truncate">{dessertEntry.recipeTitle}</span>
                  <button
                    onClick={() => {
                      setDessertEntry(null)
                      onDessertRemove?.(date, mealType)
                    }}
                    aria-label="Remove dessert"
                    className="text-stone-300 hover:text-red-400 transition-colors text-base leading-none"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDessertVaultOpen(true)}
                  className="text-xs text-stone-400 hover:text-stone-600 pl-4 underline transition-colors"
                >
                  Add dessert
                </button>
              )}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex flex-wrap gap-2 px-3 py-2.5 bg-stone-50/50 border-t border-stone-100">
            <button
              onClick={() => setVaultOpen(true)}
              className="text-xs font-medium text-stone-600 border border-stone-300 px-3 py-1.5 rounded-lg hover:bg-stone-50 transition-colors"
            >
              Choose from recipe box
            </button>

            {!freeTextExpanded ? (
              <button
                onClick={() => setFreeTextExpanded(true)}
                className="text-xs font-medium text-stone-600 border border-stone-300 px-3 py-1.5 rounded-lg hover:bg-stone-50 transition-colors"
              >
                Something else in mind? ▾
              </button>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); handleFreeTextSubmit() }}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <input
                  type="text"
                  value={freeTextQuery}
                  onChange={(e) => setFreeTextQuery(e.target.value)}
                  placeholder="e.g. Something with chicken"
                  autoFocus
                  className="flex-1 min-w-0 border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-sage-500"
                />
                <button
                  type="submit"
                  disabled={freeTextLoading}
                  className="text-xs font-medium bg-stone-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {freeTextLoading ? '…' : 'Find'}
                </button>
              </form>
            )}

            {freeTextError && (
              <p className="w-full text-xs text-red-500 mt-1">{freeTextError}</p>
            )}
          </div>
        </div>
      )}

      {/* Assign to different day — rendered outside opacity-affected rows so it's never dimmed */}
      {assignOpen && assignRecipe && (
        <AssignDayPicker
          activeDates={activeDates}
          excludeDate={date}
          onSelect={(targetDate) => {
            onAssignToDay(assignRecipe, date, targetDate, mealType)
            setAssignOpen(null)
          }}
          onClose={() => setAssignOpen(null)}
        />
      )}

      {/* Vault search sheet for main slot */}
      {vaultOpen && (
        <VaultSearchSheet
          forDate={date}
          mealType={mealType}
          onAssign={(recipe) => {
            onVaultPick(date, mealType, recipe)
            setVaultOpen(false)
          }}
          onClose={() => setVaultOpen(false)}
        />
      )}

      {/* Vault search sheet for side dish */}
      {sideDishVaultOpen && (
        <VaultSearchSheet
          forDate={date}
          allowedCategories={['side_dish']}
          onAssign={(recipe) => {
            setSideDishEntry(recipe)
            onSideDishPick?.(date, mealType, recipe)
            setSideDishVaultOpen(false)
          }}
          onClose={() => setSideDishVaultOpen(false)}
        />
      )}

      {/* Vault search sheet for dessert */}
      {dessertVaultOpen && (
        <VaultSearchSheet
          forDate={date}
          mealType="dessert"
          onAssign={(recipe) => {
            setDessertEntry(recipe)
            onDessertPick?.(date, mealType, recipe)
            setDessertVaultOpen(false)
          }}
          onClose={() => setDessertVaultOpen(false)}
        />
      )}
    </div>
  )
}
