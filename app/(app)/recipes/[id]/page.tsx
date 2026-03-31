'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Recipe } from '@/types'
import { CATEGORY_LABELS } from '@/lib/category-labels'
import { formatMinutes } from '@/lib/format-time'
import TagPill from '@/components/recipes/TagPill'
import DeleteConfirmDialog from '@/components/recipes/DeleteConfirmDialog'
import ShareToggle from '@/components/recipes/ShareToggle'
import AIGeneratedBadge from '@/components/recipes/AIGeneratedBadge'
import GenerateRecipeModal from '@/components/recipes/GenerateRecipeModal'
import { getAccessToken, getSupabaseClient } from '@/lib/supabase/browser'
import { getTodayISO } from '@/lib/date-utils'
import { convertIngredients } from '@/lib/convert-units'

type RecipeWithHistory = Recipe & { last_made: string | null; times_made: number }

interface Props {
  params: { id: string }
}

export default function RecipeDetailPage({ params }: Props) {
  const [recipe, setRecipe] = useState<RecipeWithHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showRegenerate, setShowRegenerate] = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')
  const [datesMade, setDatesMade] = useState<string[]>([])
  const [logStatus, setLogStatus] = useState<'idle' | 'loading' | 'success' | 'already_logged'>('idle')
  const [showLogModal, setShowLogModal] = useState(false)
  const [logDate, setLogDate] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [logError, setLogError] = useState<string | null>(null)
  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial')

  const isOwner = !!currentUserId && recipe?.user_id === currentUserId

  useEffect(() => {
    void (async () => {
      const { data } = await getSupabaseClient().auth.getSession()
      setCurrentUserId(data.session?.user?.id ?? '')
    })()
  }, [])

  useEffect(() => {
    async function fetchRecipe() {
      try {
        const r = await fetch(`/api/recipes/${params.id}`, {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
        })
        if (r.status === 404) { setNotFound(true); setLoading(false); return }
        if (!r.ok) throw new Error('Failed to load recipe')
        const data: RecipeWithHistory = await r.json()
        if (data) {
          setRecipe(data)
          setDatesMade((data.dates_made ?? []).slice().sort().reverse())
        }
        setFetchError(null)
        setLoading(false)
      } catch (err) {
        setFetchError('Something went wrong loading this recipe.')
        console.error(err)
        setLoading(false)
      }
    }
    fetchRecipe()
  }, [params.id])

  function openLogModal() {
    setLogDate(getTodayISO())
    setShowLogModal(true)
  }

  async function handleLogDate() {
    if (!logDate) return
    setShowLogModal(false)
    setLogStatus('loading')
    setLogError(null)
    try {
      const res = await fetch(`/api/recipes/${params.id}/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAccessToken()}`,
        },
        body: JSON.stringify({ made_on: logDate }),
      })
      if (res.ok) {
        const data: { made_on: string; already_logged: boolean } = await res.json()
        if (data.already_logged) {
          setLogStatus('already_logged')
        } else {
          setLogStatus('success')
          setDatesMade((prev) =>
            prev.includes(data.made_on) ? prev : [data.made_on, ...prev].sort().reverse()
          )
        }
        setTimeout(() => setLogStatus('idle'), 2000)
      } else {
        setLogError('Couldn\'t log this date. Please try again.')
        setLogStatus('idle')
      }
    } catch (err) {
      setLogError('Couldn\'t log this date. Please try again.')
      console.error(err)
      setLogStatus('idle')
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 font-sans text-stone-400">
        Loading…
      </div>
    )
  }

  if (fetchError && !recipe) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-red-500 text-sm">{fetchError}</p>
        <Link href="/recipes" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
          ← Back to recipes
        </Link>
      </div>
    )
  }

  if (notFound || !recipe) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-stone-500">Recipe not found.</p>
        <Link href="/recipes" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
          ← Back to recipes
        </Link>
      </div>
    )
  }

  const lastMadeLabel = datesMade.length > 0
    ? `Last made ${new Date(datesMade[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${datesMade.length}×`
    : 'Never made'

  const timeItems = [
    { label: 'Prep', value: formatMinutes(recipe.prep_time_minutes ?? null) },
    { label: 'Cook', value: formatMinutes(recipe.cook_time_minutes ?? null) },
    { label: 'Total', value: formatMinutes(recipe.total_time_minutes ?? null) },
    { label: 'Inactive', value: formatMinutes(recipe.inactive_time_minutes ?? null) },
    { label: 'Servings', value: recipe.servings != null ? String(recipe.servings) : '—' },
  ]

  return (
    <div className="min-h-screen bg-stone-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Back link */}
        <Link
          href="/recipes"
          className="font-sans text-sm text-stone-500 hover:text-stone-700 mb-5 inline-block"
        >
          ← All Recipes
        </Link>

        {/* Recipe card */}
        <div className="rounded-[4px] border border-stone-200 bg-white overflow-hidden">
          {/* Top accent bar */}
          <div className="h-[5px] bg-sage-500" />

          {/* Hero image */}
          {recipe.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={recipe.image_url}
              alt={recipe.title}
              className="w-full object-cover max-h-[280px]"
            />
          )}

          {/* Header section */}
          <div className="px-6 pt-5 pb-4">
            {/* Category label */}
            <p className="font-display text-[10px] uppercase tracking-[0.12em] text-stone-400 mb-1">
              {CATEGORY_LABELS[recipe.category]}
            </p>

            {/* AI generated badge */}
            {recipe.source === 'generated' && (
              <div className="mb-2">
                <AIGeneratedBadge />
              </div>
            )}

            {/* Title */}
            <h1 className="font-display font-bold text-[22px] text-stone-800 mb-3">
              {recipe.title}
            </h1>

            {/* Times row */}
            <div className="flex flex-wrap gap-6">
              {timeItems.map(({ label, value }) => (
                <div key={label}>
                  <p className="font-sans text-[9px] uppercase tracking-[0.10em] text-stone-400 mb-0.5">
                    {label}
                  </p>
                  <p className="font-sans text-[13px] text-stone-700">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Dashed divider */}
          <div className="mx-6 border-t border-dashed border-stone-200" />

          {/* Tags row */}
          <div className="px-6 py-3">
            <div className="flex flex-wrap gap-2">
              {recipe.tags.length === 0
                ? <span className="font-sans text-sm text-stone-400">No tags</span>
                : recipe.tags.map((t) => <TagPill key={t} label={t} />)}
            </div>
          </div>

          {/* Dashed divider */}
          <div className="mx-6 border-t border-dashed border-stone-200" />

          {/* Body: two-column grid */}
          <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: Ingredients */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-semibold text-[13px] tracking-[0.04em] text-stone-700">
                  Ingredients
                </h2>
                {recipe.ingredients && (
                  <div className="flex rounded-lg overflow-hidden border border-stone-200 text-[11px] font-medium">
                    {(['imperial', 'metric'] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setUnitSystem(u)}
                        className={`px-2.5 py-1 transition-colors ${
                          unitSystem === u
                            ? 'bg-sage-500 text-white'
                            : 'text-stone-500 hover:text-stone-700'
                        }`}
                      >
                        {u === 'imperial' ? 'Imperial' : 'Metric'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {recipe.ingredients ? (
                <ul>
                  {convertIngredients(recipe.ingredients, unitSystem).split('\n').filter(Boolean).map((line, i, arr) => (
                    <li
                      key={i}
                      className={`font-sans text-[13px] text-stone-700 py-2 ${i < arr.length - 1 ? 'border-b border-stone-100' : ''}`}
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-sans text-sm text-stone-400">No ingredients listed.</p>
              )}
            </div>

            {/* Right: Steps */}
            <div>
              <h2 className="font-display font-semibold text-[13px] tracking-[0.04em] text-stone-700 mb-3">
                Steps
              </h2>
              {recipe.steps ? (
                <ol className="space-y-3">
                  {recipe.steps.split('\n').filter(Boolean).map((line, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sage-500 flex items-center justify-center font-display font-semibold text-[10px] text-white mt-0.5">
                        {i + 1}
                      </span>
                      <span className="font-sans text-[13px] text-stone-700">
                        {line}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="font-sans text-sm text-stone-400">No steps listed.</p>
              )}
            </div>
          </div>

          {/* Notes section */}
          {recipe.notes && (
            <>
              <div className="mx-6 border-t border-dashed border-stone-200" />
              <div className="px-6 py-4">
                <h2 className="font-display font-semibold text-[13px] tracking-[0.04em] text-stone-700 mb-2">
                  Notes
                </h2>
                <p className="font-sans text-[13px] text-stone-500 whitespace-pre-wrap">
                  {recipe.notes}
                </p>
              </div>
            </>
          )}

          {/* Share toggle — owner only */}
          {isOwner && (
            <>
              <div className="mx-6 border-t border-dashed border-stone-200" />
              <div className="px-6 py-3">
                <ShareToggle
                  recipeId={recipe.id}
                  initialIsShared={recipe.is_shared}
                  getToken={getAccessToken}
                  onUpdate={(isShared) => setRecipe((r) => r ? { ...r, is_shared: isShared } : r)}
                />
              </div>
            </>
          )}

          {/* Footer dashed divider */}
          <div className="mx-6 border-t border-dashed border-stone-200" />

          {/* Footer */}
          {logError && (
            <div className="px-6">
              <p className="text-red-500 text-sm mt-2">{logError}</p>
            </div>
          )}
          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              {recipe.url && (
                <a
                  href={recipe.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-[11px] text-sage-600 no-underline hover:underline"
                >
                  View original recipe →
                </a>
              )}
              <p className="font-sans text-[12px] text-stone-400">
                {lastMadeLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
            {recipe.steps && recipe.steps.split('\n').filter(Boolean).length > 0 && (
              <Link
                href={`/recipes/${recipe.id}/cook`}
                className="font-display font-medium text-[13px] text-white bg-sage-500 hover:bg-sage-600 rounded-xl py-2 px-4"
              >
                Start Cooking
              </Link>
            )}
            {isOwner && (
              <Link
                href={`/recipes/${recipe.id}/edit`}
                className="font-display font-medium text-[13px] text-stone-700 border border-stone-200 rounded-xl py-2 px-4 bg-white hover:bg-stone-50"
              >
                Edit
              </Link>
            )}
            <button
              onClick={openLogModal}
              disabled={logStatus === 'loading'}
              className="font-display font-medium text-[13px] text-stone-700 border border-stone-200 rounded-xl py-2 px-4 bg-white hover:bg-stone-50 disabled:opacity-50"
            >
              {logStatus === 'success' ? '✓ Logged!' : logStatus === 'already_logged' ? 'Already logged' : 'Log made'}
            </button>
            {isOwner && recipe.source === 'generated' && (
              <button
                onClick={() => setShowRegenerate(true)}
                className="font-display font-medium text-[13px] text-stone-700 border border-stone-200 rounded-xl py-2 px-4 bg-white hover:bg-stone-50"
              >
                Regenerate
              </button>
            )}
            {isOwner && (
              <button
                onClick={() => setShowDelete(true)}
                className="font-display font-medium text-[13px] text-stone-700 border border-stone-200 rounded-xl py-2 px-4 bg-white hover:bg-stone-50"
              >
                Delete
              </button>
            )}
            </div>
          </div>
        </div>
      </div>

      {showDelete && (
        <DeleteConfirmDialog
          recipeId={recipe.id}
          getToken={getAccessToken}
          onCancel={() => setShowDelete(false)}
        />
      )}

      {showLogModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-xs w-full space-y-4">
            <h2 className="font-display text-base font-semibold text-stone-800">Log a date made</h2>
            <input
              type="date"
              value={logDate}
              max={getTodayISO()}
              onChange={(e) => setLogDate(e.target.value)}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-sage-400"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleLogDate}
                disabled={!logDate}
                className="font-display flex-1 px-4 py-2 bg-sage-500 text-white text-sm font-medium rounded-lg hover:bg-sage-600 disabled:opacity-40"
              >
                Log
              </button>
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="flex-1 px-4 py-2 border border-stone-300 text-stone-700 text-sm font-medium rounded-lg hover:bg-stone-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showRegenerate && (
        <GenerateRecipeModal
          onClose={() => setShowRegenerate(false)}
          onSaved={() => setShowRegenerate(false)}
          getToken={getAccessToken}
          initialIngredients={recipe.ingredients ?? ''}
        />
      )}
    </div>
  )
}
