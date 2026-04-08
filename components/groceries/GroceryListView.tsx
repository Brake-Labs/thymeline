'use client'

import { useState, useCallback, useEffect } from 'react'
import { GroceryItem, GroceryList, GrocerySection, RecipeScale } from '@/types'
import GroceryItemRow from './GroceryItemRow'
import GotItSection from './GotItSection'
import AddItemInput from './AddItemInput'
import StepperInput from '@/components/preferences/StepperInput'
import { effectiveServings, formatWeekLabel, buildPlainTextList, buildICSExport, buildShortcutsURL } from '@/lib/grocery'
import { TOAST_DURATION_LONG_MS } from '@/lib/constants'

const SHORTCUTS_INSTALL_URL = 'https://www.icloud.com/shortcuts/a15dc8284acb4ecf912e934afc8c238c'

// Aisle order used for grouping "Need to Buy" items
const SECTION_ORDER: GrocerySection[] = [
  'Produce', 'Proteins', 'Dairy & Eggs', 'Deli', 'Pantry',
  'Canned & Jarred', 'Bakery', 'Beverages', 'Frozen', 'Other',
]

interface GroceryListViewProps {
  initialList:    GroceryList
  dateFrom?:      string
  dateTo?:        string
  onListUpdated?: (list: GroceryList) => void
}

export default function GroceryListView({ initialList, dateFrom, dateTo }: GroceryListViewProps) {
  const [items, setItems] = useState<GroceryItem[]>(initialList.items)
  const [planServings, setPlanServings] = useState(initialList.servings)
  const [recipeScales, setRecipeScales] = useState<RecipeScale[]>(initialList.recipeScales)
  const [saving, setSaving] = useState(false)
  const [recipesOpen, setRecipesOpen] = useState(true)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [shareToast, setShareToast] = useState<string | null>(null)
  const [showRemindersDialog, setShowRemindersDialog] = useState(false)
  const [isMac, setIsMac] = useState(false)
  const [shortcutInstalled, setShortcutInstalled] = useState(false)
  const weekStart = initialList.weekStart

  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent
      const isMacUA = /Macintosh/.test(ua)
      // iPadOS 13+ reports a Mac UA but has touch support with multiple points
      const isIPadOS = isMacUA && navigator.maxTouchPoints > 1
      setIsMac(isMacUA && !isIPadOS)
      setIsIOS(/iPhone|iPad|iPod/.test(ua) || isIPadOS)
    }
    try {
      setShortcutInstalled(localStorage.getItem('thymeline-shortcut-installed') === 'true')
    } catch { /* Safari private browsing / quota exceeded */ }
  }, [])

  // ── Persist helpers ─────────────────────────────────────────────────────────

  async function patch(payload: {
    items?:         GroceryItem[]
    servings?:      number
    recipeScales?: RecipeScale[]
  }) {
    setSaving(true)
    try {
      await fetch('/api/groceries', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ weekStart: weekStart, ...payload }),
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
      isPantry: false,
      checked:   false,
      recipes:   [],
    }
    const updated = [...items, newItem]
    setItems(updated)
    await patch({ items: updated })
  }, [items, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleEdit = useCallback(async (
    itemId: string,
    updates: { name: string; amount: number | null; unit: string | null },
  ) => {
    const updated = items.map((i) => i.id === itemId ? { ...i, ...updates } : i)
    setItems(updated)
    await patch({ items: updated })
  }, [items, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteRecipe = useCallback(async (recipeId: string, recipeTitle: string) => {
    const updated = items.filter((i) => !i.recipes.includes(recipeTitle) || i.recipes.length > 1)
    const updatedScales = recipeScales.filter((s) => s.recipeId !== recipeId)
    setItems(updated)
    setRecipeScales(updatedScales)
    await patch({ items: updated, recipeScales: updatedScales })
  }, [items, recipeScales, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Servings ────────────────────────────────────────────────────────────────

  const handleRecipeServingsChange = useCallback(async (recipeId: string, recipeTitle: string, newCount: number) => {
    const currentEffective = effectiveServings(recipeId, recipeScales, planServings)
    const updated = items.map((item) => {
      if (item.checked || item.amount === null) return item
      if (!item.recipes.includes(recipeTitle)) return item
      const newAmount = Math.round(item.amount * (newCount / currentEffective) * 100) / 100
      return { ...item, amount: newAmount }
    })
    const updatedScales = recipeScales.map((s) =>
      s.recipeId === recipeId ? { ...s, servings: newCount } : s,
    )
    setItems(updated)
    setRecipeScales(updatedScales)
    await patch({ items: updated, recipeScales: updatedScales })
  }, [items, recipeScales, planServings, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleResetOverride = useCallback(async (recipeId: string, recipeTitle: string) => {
    const scale = recipeScales.find((s) => s.recipeId === recipeId)
    if (!scale?.servings) return
    const currentOverride = scale.servings
    const updated = items.map((item) => {
      if (item.checked || item.amount === null) return item
      if (!item.recipes.includes(recipeTitle)) return item
      const newAmount = Math.round(item.amount * (planServings / currentOverride) * 100) / 100
      return { ...item, amount: newAmount }
    })
    const updatedScales = recipeScales.map((s) =>
      s.recipeId === recipeId ? { ...s, servings: null } : s,
    )
    setItems(updated)
    setRecipeScales(updatedScales)
    await patch({ items: updated, recipeScales: updatedScales })
  }, [items, recipeScales, planServings, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Regenerate ──────────────────────────────────────────────────────────────

  async function handleRegenerateConfirm() {
    setRegenerating(true)
    setConfirmRegenerate(false)
    try {
      const body = dateFrom && dateTo
        ? { dateFrom: dateFrom, dateTo: dateTo }
        : { weekStart: weekStart }
      const res = await fetch('/api/groceries/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      if (res.ok) {
        const { list } = await res.json()
        setItems(list.items)
        setPlanServings(list.servings)
        setRecipeScales(list.recipeScales)
      }
    } finally {
      setRegenerating(false)
    }
  }

  // ── Share ───────────────────────────────────────────────────────────────────

  async function handleShare() {
    const header = `Grocery list — week of ${weekStart}`
    const itemList = buildPlainTextList(items, { onlyUnchecked: true })
    const text = itemList ? `${header}\n\n${itemList}` : header

    // 1. iOS: share as .ics file so Reminders imports each item as a VTODO
    if (isIOS && typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
      try {
        const icsContent = buildICSExport(items, { onlyUnchecked: true })
        const icsFile = new File([icsContent], 'groceries.ics', { type: 'text/calendar' })
        if (navigator.canShare({ files: [icsFile] })) {
          await navigator.share({ files: [icsFile] })
          return
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        /* fall through to text share */
      }
    }

    // 2. Text share — opens the native share sheet (Notes, Messages, Mail, etc.)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        /* fall through */
      }
    }

    // 3. Last resort: clipboard copy
    try {
      await navigator.clipboard.writeText(text)
      setShareToast('Copied to clipboard!')
      setTimeout(() => setShareToast(null), TOAST_DURATION_LONG_MS)
    } catch {
      setShareToast('Could not share list')
      setTimeout(() => setShareToast(null), TOAST_DURATION_LONG_MS)
    }
  }

  // ── Add to Reminders (via Apple Shortcuts) ──────────────────────────────────

  function handleAddToReminders() {
    // We set this optimistically — there's no way to detect if the Shortcut is
    // actually installed from the browser. If it's not, Shortcuts app shows an
    // error and the user can click "Add to Reminders" again (dialog still accessible
    // via long-press or after clearing localStorage).
    try { localStorage.setItem('thymeline-shortcut-installed', 'true') } catch { /* private browsing */ }
    setShortcutInstalled(true)
    setShowRemindersDialog(false)
    const url = buildShortcutsURL(items, { onlyUnchecked: true })
    window.location.href = url
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const totalCount  = items.length
  const boughtItems = items.filter((i) => i.bought)

  // Need to Buy: non-pantry items not yet bought, grouped by grocery section
  const needToBuyItems = items.filter((i) => !i.isPantry && !i.bought)
  const needToBuyBySection: Partial<Record<GrocerySection, GroceryItem[]>> = {}
  for (const item of needToBuyItems) {
    if (!needToBuyBySection[item.section]) needToBuyBySection[item.section] = []
    needToBuyBySection[item.section]!.push(item)
  }

  // Pantry Items: isPantry items not yet bought
  const pantryItems = items.filter((i) => i.isPantry && !i.bought)

  const checkedCount = items.filter((i) => i.checked || i.bought).length
  const orderedTitles = recipeScales.map((s) => s.recipeTitle)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-xl font-bold text-stone-800">
          Groceries for {formatWeekLabel(weekStart)}
        </h1>
        <div className="flex items-center gap-3">
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
          {isMac && (
            <button
              type="button"
              onClick={() => shortcutInstalled ? handleAddToReminders() : setShowRemindersDialog(true)}
              className="text-sm px-4 py-2 border border-sage-400 text-sage-700 rounded-lg hover:bg-sage-50"
            >
              Add to Reminders
            </button>
          )}
        </div>
      </div>

      {saving && (
        <p className="text-xs text-stone-400">Saving…</p>
      )}

      {/* Recipes panel (collapsible) */}
      {orderedTitles.length > 0 && (
        <section
          aria-label="Recipes in this list"
          className="border border-stone-200 rounded-xl bg-white overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setRecipesOpen((o) => !o)}
            aria-expanded={recipesOpen}
            className="w-full flex items-center justify-between px-4 pt-4 pb-3 border-b border-stone-100 text-left"
          >
            <h2 className="font-display font-semibold text-stone-800 text-sm">
              Recipes ({orderedTitles.length})
            </h2>
            <span className="text-xs text-stone-400">{recipesOpen ? '▾' : '▸'}</span>
          </button>

          {recipesOpen && (
            <div className="divide-y divide-stone-50">
              {orderedTitles.map((title) => {
                const scale = recipeScales.find((s) => s.recipeTitle === title)!
                const effective = effectiveServings(scale.recipeId, recipeScales, planServings)
                return (
                  <div key={scale.recipeId} className="px-4 py-3 flex flex-col gap-1.5">
                    <span className="font-medium text-stone-800 text-sm">
                      {title}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StepperInput
                        value={effective}
                        min={1}
                        max={20}
                        onChange={(count) => handleRecipeServingsChange(scale.recipeId, title, count)}
                        label="Servings"
                      />
                      {scale.servings !== null && (
                        <button
                          type="button"
                          onClick={() => handleResetOverride(scale.recipeId, title)}
                          className="text-xs text-stone-500 hover:text-stone-800 underline"
                        >
                          Reset to default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleMarkAllBought(title)}
                        className="text-xs text-stone-500 hover:text-sage-600 underline transition-colors"
                      >
                        Mark all as bought
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRecipe(scale.recipeId, title)}
                        aria-label={`Remove ${title} from list`}
                        className="text-xs text-stone-400 hover:text-red-500 underline transition-colors"
                      >
                        Remove recipe
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Need to Buy */}
      <section aria-label="Need to Buy">
        <div className="mb-3">
          <h2 className="font-display font-semibold text-stone-800">Need to Buy</h2>
          <p className="text-xs text-stone-400 mt-0.5">Check off items you already have</p>
        </div>

        {needToBuyItems.length === 0 ? (
          <p className="text-sm text-stone-400 py-2">All items accounted for.</p>
        ) : (
          <div className="space-y-3">
            {SECTION_ORDER.map((section) => {
              const sectionItems = needToBuyBySection[section]
              if (!sectionItems?.length) return null
              return (
                <div key={section}>
                  <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider mb-1.5 px-1">
                    {section}
                  </p>
                  <div className="border border-stone-200 rounded-xl bg-white px-4 py-1 divide-y divide-stone-50">
                    {sectionItems.map((item) => (
                      <GroceryItemRow
                        key={item.id}
                        item={item}
                        mode="need"
                        onToggle={() => handleToggle(item.id)}
                        onRemove={() => handleRemove(item.id)}
                        onGotIt={() => handleGotIt(item.id)}
                        onEdit={handleEdit}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Pantry Items */}
      {pantryItems.length > 0 && (
        <section aria-label="Pantry Items">
          <div className="mb-3">
            <h2 className="font-display font-semibold text-stone-800">Pantry Items</h2>
            <p className="text-xs text-stone-400 mt-0.5">Check items you need to pick up</p>
          </div>
          <div className="border border-stone-200 rounded-xl bg-white px-4 py-1 divide-y divide-stone-50">
            {pantryItems.map((item) => (
              <GroceryItemRow
                key={item.id}
                item={item}
                mode="pantry"
                onToggle={() => handleToggle(item.id)}
                onRemove={() => handleRemove(item.id)}
                onEdit={handleEdit}
              />
            ))}
          </div>
        </section>
      )}

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

      {/* Add to Reminders — first-time setup dialog */}
      {showRemindersDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="font-display text-base font-semibold text-stone-800">Set up Reminders</h2>
            <p className="text-sm text-stone-600">
              To add grocery items to Apple Reminders, you need to install a free
              shortcut first. This is a one-time setup.
            </p>
            <ol className="text-sm text-stone-600 list-decimal list-inside space-y-1">
              <li>
                <a
                  href={SHORTCUTS_INSTALL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sage-600 hover:text-sage-800 underline"
                >
                  Install the &ldquo;Thymeline Groceries&rdquo; shortcut
                </a>
              </li>
              <li>Come back here and tap the button below</li>
            </ol>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleAddToReminders}
                className="font-display w-full px-4 py-2 bg-sage-500 text-white text-sm font-medium rounded-lg hover:bg-sage-600"
              >
                Send to Reminders
              </button>
              <button
                type="button"
                onClick={() => setShowRemindersDialog(false)}
                className="w-full px-4 py-2 border border-stone-300 text-stone-700 text-sm font-medium rounded-lg hover:bg-stone-50"
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
