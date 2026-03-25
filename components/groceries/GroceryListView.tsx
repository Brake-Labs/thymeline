'use client'

import { useState, useCallback } from 'react'
import { GroceryItem, GroceryList, RecipeScale } from '@/types'
import StepperInput from '@/components/preferences/StepperInput'
import GroceryItemRow from './GroceryItemRow'
import RecipeSectionGroup from './RecipeSectionGroup'
import GotItSection from './GotItSection'
import AddItemInput from './AddItemInput'
import { getAccessToken } from '@/lib/supabase/browser'
import { effectiveServings, formatWeekLabel, buildPlainTextList, scaleItem } from '@/lib/grocery'

interface GroceryListViewProps {
  initialList:    GroceryList
  dateFrom?:      string
  dateTo?:        string
  onListUpdated?: (list: GroceryList) => void
}

export default function GroceryListView({ initialList, dateFrom, dateTo }: GroceryListViewProps) {
  const [items, setItems] = useState<GroceryItem[]>(initialList.items)
  const [planServings, setPlanServings] = useState(initialList.servings)
  const [recipeScales, setRecipeScales] = useState<RecipeScale[]>(initialList.recipe_scales)
  const [saving, setSaving] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [shareToast, setShareToast] = useState<string | null>(null)
  const [gotItCollapsed, setGotItCollapsed] = useState(true)

  const weekStart = initialList.week_start

  // ── Persist helpers ─────────────────────────────────────────────────────────

  async function patch(payload: {
    items?:         GroceryItem[]
    servings?:  number
    recipe_scales?: RecipeScale[]
  }) {
    setSaving(true)
    try {
      const token = await getAccessToken()
      await fetch('/api/groceries', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ week_start: weekStart, ...payload }),
      })
    } finally {
      setSaving(false)
    }
  }

  // ── Item operations ─────────────────────────────────────────────────────────

  const handleToggle = useCallback(async (itemId: string) => {
    const updated = items.map((i) =>
      i.id === itemId ? { ...i, checked: !i.checked } : i,
    )
    setItems(updated)
    await patch({ items: updated })
  }, [items, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemove = useCallback(async (itemId: string) => {
    const updated = items.filter((i) => i.id !== itemId)
    setItems(updated)
    await patch({ items: updated })
  }, [items, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddItem = useCallback(async (name: string) => {
    const newItem: GroceryItem = {
      id:        crypto.randomUUID(),
      name,
      amount:    null,
      unit:      null,
      section:   'Other',
      is_pantry: false,
      checked:   false,
      recipes:   [],
    }
    const updated = [...items, newItem]
    setItems(updated)
    await patch({ items: updated })
  }, [items, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark all bought for a recipe ─────────────────────────────────────────────

  const handleGotIt = useCallback(async (itemId: string) => {
    const updated = items.map((i) =>
      i.id === itemId ? { ...i, bought: true } : i,
    )
    setItems(updated)
    await patch({ items: updated })
  }, [items, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUndoBought = useCallback(async (itemId: string) => {
    const updated = items.map((i) =>
      i.id === itemId ? { ...i, bought: false } : i,
    )
    setItems(updated)
    await patch({ items: updated })
  }, [items, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkAllBought = useCallback(async (recipeTitle: string) => {
    const updated = items.map((i) =>
      i.recipes.includes(recipeTitle) ? { ...i, bought: true } : i,
    )
    setItems(updated)
    await patch({ items: updated })
  }, [items, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Servings ────────────────────────────────────────────────────────────────

  const handlePlanServingsChange = useCallback(async (newCount: number) => {
    // Rescale items for recipes that don't have an override
    const oldCount = planServings
    const updated = items.map((item) => {
      if (item.checked || item.amount === null) return item
      // Find what recipe this item belongs to (use first recipe title)
      const firstTitle = item.recipes[0]
      if (!firstTitle) return item
      const scale = recipeScales.find((s) => s.recipe_title === firstTitle)
      if (scale?.servings !== null && scale?.servings !== undefined) return item // has override
      // Rescale: divide by old, multiply by new
      const newAmount = Math.round(item.amount * (newCount / oldCount) * 100) / 100
      return { ...item, amount: newAmount }
    })
    setItems(updated)
    setPlanServings(newCount)
    await patch({ items: updated, servings: newCount })
  }, [items, planServings, recipeScales, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRecipeServingsChange = useCallback(async (recipeId: string, recipeTitle: string, newCount: number) => {
    const currentEffective = effectiveServings(recipeId, recipeScales, planServings)
    // Rescale items belonging to this recipe
    const updated = items.map((item) => {
      if (item.checked || item.amount === null) return item
      if (!item.recipes.includes(recipeTitle)) return item
      const newAmount = Math.round(item.amount * (newCount / currentEffective) * 100) / 100
      return { ...item, amount: newAmount }
    })
    const updatedScales = recipeScales.map((s) =>
      s.recipe_id === recipeId ? { ...s, servings: newCount } : s,
    )
    setItems(updated)
    setRecipeScales(updatedScales)
    await patch({ items: updated, recipe_scales: updatedScales })
  }, [items, recipeScales, planServings, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleResetOverride = useCallback(async (recipeId: string, recipeTitle: string) => {
    const scale = recipeScales.find((s) => s.recipe_id === recipeId)
    if (!scale?.servings) return
    const currentOverride = scale.servings
    // Rescale back to plan default
    const updated = items.map((item) => {
      if (item.checked || item.amount === null) return item
      if (!item.recipes.includes(recipeTitle)) return item
      const newAmount = Math.round(item.amount * (planServings / currentOverride) * 100) / 100
      return { ...item, amount: newAmount }
    })
    const updatedScales = recipeScales.map((s) =>
      s.recipe_id === recipeId ? { ...s, servings: null } : s,
    )
    setItems(updated)
    setRecipeScales(updatedScales)
    await patch({ items: updated, recipe_scales: updatedScales })
  }, [items, recipeScales, planServings, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Regenerate ──────────────────────────────────────────────────────────────

  async function handleRegenerateConfirm() {
    setRegenerating(true)
    setConfirmRegenerate(false)
    try {
      const token = await getAccessToken()
      const body = dateFrom && dateTo
        ? { date_from: dateFrom, date_to: dateTo }
        : { week_start: weekStart }
      const res = await fetch('/api/groceries/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      })
      if (res.ok) {
        const { list } = await res.json()
        setItems(list.items)
        setPlanServings(list.servings)
        setRecipeScales(list.recipe_scales)
      }
    } finally {
      setRegenerating(false)
    }
  }

  // ── Share ───────────────────────────────────────────────────────────────────

  async function handleShare() {
    const text = buildPlainTextList(items, recipeScales, planServings, weekStart)
    const title = `Grocery list — week of ${weekStart}`
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text })
        return
      } catch { /* fall through */ }
    }
    // Fallback: clipboard
    try {
      await navigator.clipboard.writeText(text)
      setShareToast('Copied to clipboard!')
      setTimeout(() => setShareToast(null), 3000)
    } catch {
      setShareToast('Could not share list')
      setTimeout(() => setShareToast(null), 3000)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const totalCount   = items.length
  const boughtItems  = items.filter((i) => i.bought)
  const checkedCount = boughtItems.length

  // Build ordered list of unique recipe titles (from recipeScales, ordered by planned_date)
  const orderedTitles = recipeScales.map((s) => s.recipe_title)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-xl font-bold text-stone-800">
          Groceries for {formatWeekLabel(weekStart)}
        </h1>
        <div className="flex items-center gap-3">
          <StepperInput
            value={planServings}
            min={1}
            max={20}
            onChange={handlePlanServingsChange}
            label="Servings"
          />
          <button
            type="button"
            onClick={() => setConfirmRegenerate(true)}
            disabled={regenerating}
            className="text-sm px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="text-sm px-4 py-2 bg-sage-500 text-white rounded-lg hover:bg-sage-600"
          >
            Share
          </button>
        </div>
      </div>

      {saving && (
        <p className="text-xs text-stone-400">Saving…</p>
      )}

      {/* Recipe sections — exclude bought items */}
      <div className="space-y-4">
        {orderedTitles.map((title) => {
          const scale = recipeScales.find((s) => s.recipe_title === title)!
          const recipeItems = items.filter((i) => i.recipes.includes(title) && !i.bought)
          const effective = effectiveServings(scale.recipe_id, recipeScales, planServings)
          return (
            <RecipeSectionGroup
              key={scale.recipe_id}
              recipeTitle={title}
              recipeId={scale.recipe_id}
              items={recipeItems}
              effectiveCount={effective}
              isOverridden={scale.servings !== null}
              onServingsChange={(count) => handleRecipeServingsChange(scale.recipe_id, title, count)}
              onResetOverride={() => handleResetOverride(scale.recipe_id, title)}
              onToggle={handleToggle}
              onRemove={handleRemove}
              onMarkAllBought={() => handleMarkAllBought(title)}
              onGotIt={handleGotIt}
            />
          )
        })}

        {/* User-added items (recipes: []) — exclude bought */}
        {items.some((i) => i.recipes.length === 0 && !i.bought) && (
          <section
            aria-label="Other items"
            className="border border-stone-200 rounded-xl bg-white overflow-hidden"
          >
            <div className="px-4 pt-4 pb-3 border-b border-stone-100">
              <h3 className="font-display font-semibold text-stone-800 text-sm">Other</h3>
            </div>
            <div className="px-4 py-2 divide-y divide-stone-50">
              {items
                .filter((i) => i.recipes.length === 0 && !i.bought)
                .map((item) => (
                  <GroceryItemRow
                    key={item.id}
                    item={item}
                    onToggle={() => handleToggle(item.id)}
                    onRemove={() => handleRemove(item.id)}
                  />
                ))}
            </div>
          </section>
        )}
      </div>

      {/* Add item */}
      <AddItemInput onAdd={handleAddItem} />

      {/* Got it section */}
      <GotItSection items={boughtItems} onUndo={handleUndoBought} />

      {/* Progress counter */}
      <p className="text-sm text-stone-400 text-right">
        {checkedCount} of {totalCount} checked
      </p>

      {/* Regenerate confirmation dialog */}
      {confirmRegenerate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="font-display text-base font-semibold text-stone-800">Regenerate grocery list?</h2>
            <p className="text-sm text-stone-600">
              This will replace your current list and reset all per-recipe servings.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRegenerateConfirm}
                className="font-display flex-1 px-4 py-2 bg-sage-500 text-white text-sm font-medium rounded-lg hover:bg-sage-600"
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={() => setConfirmRegenerate(false)}
                className="flex-1 px-4 py-2 border border-stone-300 text-stone-700 text-sm font-medium rounded-lg hover:bg-stone-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share toast */}
      {shareToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {shareToast}
        </div>
      )}
    </div>
  )
}

