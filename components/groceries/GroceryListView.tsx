'use client'

import { useState, useCallback } from 'react'
import { GroceryItem, GroceryList, RecipeScale } from '@/types'
import StepperInput from '@/components/preferences/StepperInput'
import GroceryItemRow from './GroceryItemRow'
import RecipeSectionGroup from './RecipeSectionGroup'
import AddItemInput from './AddItemInput'
import { getAccessToken } from '@/lib/supabase/browser'
import { effectivePeopleCount, formatWeekLabel, buildPlainTextList, scaleItem } from '@/lib/grocery'

interface GroceryListViewProps {
  initialList: GroceryList
}

export default function GroceryListView({ initialList }: GroceryListViewProps) {
  const [items, setItems] = useState<GroceryItem[]>(initialList.items)
  const [planPeople, setPlanPeople] = useState(initialList.people_count)
  const [recipeScales, setRecipeScales] = useState<RecipeScale[]>(initialList.recipe_scales)
  const [saving, setSaving] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [shareToast, setShareToast] = useState<string | null>(null)

  const weekStart = initialList.week_start

  // ── Persist helpers ─────────────────────────────────────────────────────────

  async function patch(payload: {
    items?:         GroceryItem[]
    people_count?:  number
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

  // ── People count ────────────────────────────────────────────────────────────

  const handlePlanPeopleChange = useCallback(async (newCount: number) => {
    // Rescale items for recipes that don't have an override
    const oldCount = planPeople
    const updated = items.map((item) => {
      if (item.checked || item.amount === null) return item
      // Find what recipe this item belongs to (use first recipe title)
      const firstTitle = item.recipes[0]
      if (!firstTitle) return item
      const scale = recipeScales.find((s) => s.recipe_title === firstTitle)
      if (scale?.people_count !== null && scale?.people_count !== undefined) return item // has override
      // Rescale: divide by old, multiply by new
      const newAmount = Math.round(item.amount * (newCount / oldCount) * 100) / 100
      return { ...item, amount: newAmount }
    })
    setItems(updated)
    setPlanPeople(newCount)
    await patch({ items: updated, people_count: newCount })
  }, [items, planPeople, recipeScales, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRecipePeopleChange = useCallback(async (recipeId: string, recipeTitle: string, newCount: number) => {
    const currentEffective = effectivePeopleCount(recipeId, recipeScales, planPeople)
    // Rescale items belonging to this recipe
    const updated = items.map((item) => {
      if (item.checked || item.amount === null) return item
      if (!item.recipes.includes(recipeTitle)) return item
      const newAmount = Math.round(item.amount * (newCount / currentEffective) * 100) / 100
      return { ...item, amount: newAmount }
    })
    const updatedScales = recipeScales.map((s) =>
      s.recipe_id === recipeId ? { ...s, people_count: newCount } : s,
    )
    setItems(updated)
    setRecipeScales(updatedScales)
    await patch({ items: updated, recipe_scales: updatedScales })
  }, [items, recipeScales, planPeople, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleResetOverride = useCallback(async (recipeId: string, recipeTitle: string) => {
    const scale = recipeScales.find((s) => s.recipe_id === recipeId)
    if (!scale?.people_count) return
    const currentOverride = scale.people_count
    // Rescale back to plan default
    const updated = items.map((item) => {
      if (item.checked || item.amount === null) return item
      if (!item.recipes.includes(recipeTitle)) return item
      const newAmount = Math.round(item.amount * (planPeople / currentOverride) * 100) / 100
      return { ...item, amount: newAmount }
    })
    const updatedScales = recipeScales.map((s) =>
      s.recipe_id === recipeId ? { ...s, people_count: null } : s,
    )
    setItems(updated)
    setRecipeScales(updatedScales)
    await patch({ items: updated, recipe_scales: updatedScales })
  }, [items, recipeScales, planPeople, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Regenerate ──────────────────────────────────────────────────────────────

  async function handleRegenerateConfirm() {
    setRegenerating(true)
    setConfirmRegenerate(false)
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/groceries/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ week_start: weekStart }),
      })
      if (res.ok) {
        const { list } = await res.json()
        setItems(list.items)
        setPlanPeople(list.people_count)
        setRecipeScales(list.recipe_scales)
      }
    } finally {
      setRegenerating(false)
    }
  }

  // ── Share ───────────────────────────────────────────────────────────────────

  async function handleShare() {
    const text = buildPlainTextList(items, recipeScales, planPeople, weekStart)
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

  const checkedCount = items.filter((i) => i.checked).length
  const totalCount   = items.length

  // Build ordered list of unique recipe titles (from recipeScales, which is ordered by planned_date)
  const orderedTitles = recipeScales.map((s) => s.recipe_title)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-stone-800">
          Groceries for {formatWeekLabel(weekStart)}
        </h1>
        <div className="flex items-center gap-3">
          <StepperInput
            value={planPeople}
            min={1}
            max={20}
            onChange={handlePlanPeopleChange}
            label="People"
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
            className="text-sm px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800"
          >
            Share
          </button>
        </div>
      </div>

      {saving && (
        <p className="text-xs text-stone-400">Saving…</p>
      )}

      {/* Recipe sections */}
      <div className="space-y-4">
        {orderedTitles.map((title) => {
          const scale = recipeScales.find((s) => s.recipe_title === title)!
          const recipeItems = items.filter((i) => i.recipes.includes(title))
          const effective = effectivePeopleCount(scale.recipe_id, recipeScales, planPeople)
          return (
            <RecipeSectionGroup
              key={scale.recipe_id}
              recipeTitle={title}
              recipeId={scale.recipe_id}
              items={recipeItems}
              effectiveCount={effective}
              isOverridden={scale.people_count !== null}
              onPeopleCountChange={(count) => handleRecipePeopleChange(scale.recipe_id, title, count)}
              onResetOverride={() => handleResetOverride(scale.recipe_id, title)}
              onToggle={handleToggle}
              onRemove={handleRemove}
            />
          )
        })}

        {/* User-added items (recipes: []) */}
        {items.some((i) => i.recipes.length === 0) && (
          <section
            aria-label="Other items"
            className="border border-stone-200 rounded-xl bg-white overflow-hidden"
          >
            <div className="px-4 pt-4 pb-3 border-b border-stone-100">
              <h3 className="font-semibold text-stone-800 text-sm">Other</h3>
            </div>
            <div className="px-4 py-2 divide-y divide-stone-50">
              {items
                .filter((i) => i.recipes.length === 0)
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

      {/* Checked count */}
      <p className="text-sm text-stone-400 text-right">
        {checkedCount} of {totalCount} checked
      </p>

      {/* Regenerate confirmation dialog */}
      {confirmRegenerate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="text-base font-semibold text-stone-800">Regenerate grocery list?</h2>
            <p className="text-sm text-stone-600">
              This will replace your current list and reset all per-recipe people counts.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRegenerateConfirm}
                className="flex-1 px-4 py-2 bg-emerald-700 text-white text-sm font-medium rounded-lg hover:bg-emerald-800"
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
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {shareToast}
        </div>
      )}
    </div>
  )
}
