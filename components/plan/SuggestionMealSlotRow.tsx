'use client'

import { useState, useRef } from 'react'
import AssignDayPicker from './AssignDayPicker'
import VaultSearchSheet from './VaultSearchSheet'
import type { RecipeSuggestion, DaySelection, MealType } from '@/types'

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch:     'Lunch',
  dinner:    'Dinner',
  snack:     'Snacks',
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
  onAssignToDay:(recipe: RecipeSuggestion, targetDate: string, mealType: MealType) => void
  onVaultPick:  (date: string, mealType: MealType, recipe: { recipe_id: string; recipe_title: string }) => void
  onFreeTextMatch:(query: string, date: string, mealType: MealType) => Promise<{ matched: boolean }>
}

export default function SuggestionMealSlotRow({
  date, mealType, options, selection, isSwapping, activeDates,
  onSelect, onSkip, onSwap, onAssignToDay, onVaultPick, onFreeTextMatch,
}: SuggestionMealSlotRowProps) {
  const [assignOpen, setAssignOpen] = useState<string | null>(null)
  const [assignRecipe, setAssignRecipe] = useState<RecipeSuggestion | null>(null)
  const [vaultOpen, setVaultOpen] = useState(false)
  const [freeTextExpanded, setFreeTextExpanded] = useState(false)
  const [freeTextQuery, setFreeTextQuery] = useState('')
  const [freeTextLoading, setFreeTextLoading] = useState(false)
  const [freeTextError, setFreeTextError] = useState('')
  const assignRef = useRef<HTMLDivElement>(null)

  const isSkipped = selection === null
  const isSelected = (recipeId: string) => selection?.recipe_id === recipeId

  const handleFreeTextSubmit = async () => {
    if (!freeTextQuery.trim()) return
    setFreeTextLoading(true)
    setFreeTextError('')
    const result = await onFreeTextMatch(freeTextQuery.trim(), date, mealType)
    setFreeTextLoading(false)
    if (!result.matched) {
      setFreeTextError("Couldn\u2019t find that in your vault \u2014 try searching")
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
          {options.length === 0 ? (
            <div className="px-3 py-2">
              <p className="text-sm text-stone-400">No suggestions — try swapping or searching your vault.</p>
            </div>
          ) : (
            options.map((opt) => {
              const selected = isSelected(opt.recipe_id)
              return (
                <div
                  key={opt.recipe_id}
                  className={[
                    'border-b border-stone-50 last:border-0 px-3 py-2.5 transition-colors',
                    selected ? 'border-l-4 border-l-sage-500 bg-sage-50' : '',
                    !selected && selection !== undefined ? 'opacity-60' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">{opt.recipe_title}</p>
                      {opt.reason && (
                        <p className="text-xs text-stone-400 italic mt-0.5">{opt.reason}</p>
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
                  <div className="relative mt-1" ref={assignOpen === opt.recipe_id ? assignRef : undefined}>
                    <button
                      onClick={() => {
                        setAssignRecipe(opt)
                        setAssignOpen(assignOpen === opt.recipe_id ? null : opt.recipe_id)
                      }}
                      className="text-xs text-stone-400 hover:text-stone-600 underline transition-colors"
                    >
                      Use for a different day
                    </button>
                    {assignOpen === opt.recipe_id && assignRecipe && (
                      <AssignDayPicker
                        activeDates={activeDates}
                        excludeDate={date}
                        onSelect={(targetDate) => {
                          onAssignToDay(assignRecipe, targetDate, mealType)
                          setAssignOpen(null)
                        }}
                        onClose={() => setAssignOpen(null)}
                      />
                    )}
                  </div>

                  {/* From vault badge */}
                  {selected && selection?.from_vault && (
                    <span className="text-xs text-stone-400 mt-1 block">From vault</span>
                  )}
                </div>
              )
            })
          )}

          {/* Footer actions */}
          <div className="flex flex-wrap gap-2 px-3 py-2.5 bg-stone-50/50 border-t border-stone-100">
            <button
              onClick={() => setVaultOpen(true)}
              className="text-xs font-medium text-stone-600 border border-stone-300 px-3 py-1.5 rounded-lg hover:bg-stone-50 transition-colors"
            >
              Pick from my vault
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

      {/* Vault search sheet */}
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
    </div>
  )
}
