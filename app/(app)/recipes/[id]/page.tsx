'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Recipe } from '@/types'
import { CATEGORY_LABELS } from '@/lib/category-labels'
import { formatMinutes } from '@/lib/format-time'
import TagPill from '@/components/recipes/TagPill'
import InlineTagEditor from '@/components/recipes/InlineTagEditor'
import LogDateSection from '@/components/recipes/LogDateSection'
import DeleteConfirmDialog from '@/components/recipes/DeleteConfirmDialog'
import ShareToggle from '@/components/recipes/ShareToggle'
import { getAccessToken, getSupabaseClient } from '@/lib/supabase/browser'

type RecipeWithHistory = Recipe & { last_made: string | null; times_made: number }

interface Props {
  params: { id: string }
}

export default function RecipeDetailPage({ params }: Props) {
  const [recipe, setRecipe] = useState<RecipeWithHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [showDelete, setShowDelete] = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')
  const [datesMade, setDatesMade] = useState<string[]>([])

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
        const data: RecipeWithHistory = await r.json()
        if (data) {
          setRecipe(data)
          setDatesMade((data.dates_made ?? []).slice().sort().reverse())
        }
        setLoading(false)
      } catch {
        setLoading(false)
      }
    }
    fetchRecipe()
  }, [params.id])

  useEffect(() => {
    async function fetchTags() {
      try {
        const r = await fetch('/api/tags', { headers: { Authorization: `Bearer ${await getAccessToken()}` } })
        const data: { firstClass: string[]; custom: { name: string }[] } = await r.json()
        setAvailableTags([...(data.firstClass ?? []), ...(data.custom ?? []).map((t) => t.name)])
      } catch {}
    }
    fetchTags()
  }, [])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 font-sans text-stone-400">
        Loading…
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
    ? `Last made ${datesMade[0]} · ${datesMade.length}×`
    : 'Never made'

  const timeItems = [
    { label: 'Prep', value: formatMinutes(recipe.prep_time_minutes ?? null) },
    { label: 'Cook', value: formatMinutes(recipe.cook_time_minutes ?? null) },
    { label: 'Total', value: formatMinutes(recipe.total_time_minutes ?? null) },
    { label: 'Inactive', value: formatMinutes(recipe.inactive_time_minutes ?? null) },
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
            {isOwner ? (
              <InlineTagEditor
                recipeId={recipe.id}
                currentTags={recipe.tags}
                availableTags={availableTags}
                getToken={getAccessToken}
                onUpdate={(tags) => setRecipe((r) => r ? { ...r, tags } : r)}
              />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {recipe.tags.length === 0
                  ? <span className="font-sans text-sm text-stone-400">No tags</span>
                  : recipe.tags.map((t) => <TagPill key={t} label={t} />)}
              </div>
            )}
          </div>

          {/* Dashed divider */}
          <div className="mx-6 border-t border-dashed border-stone-200" />

          {/* Body: two-column grid */}
          <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: Ingredients */}
            <div>
              <h2 className="font-display font-semibold text-[13px] tracking-[0.04em] text-stone-700 mb-3">
                Ingredients
              </h2>
              {recipe.ingredients ? (
                <ul>
                  {recipe.ingredients.split('\n').filter(Boolean).map((line, i, arr) => (
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
          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
            {/* Left: last made + source */}
            <div className="flex flex-col gap-0.5">
              <p className="font-sans text-[11px] text-stone-400">
                {lastMadeLabel}
              </p>
              {recipe.url && (
                <a
                  href={recipe.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-[11px] text-stone-400 hover:text-stone-600 hover:underline"
                >
                  View original recipe ↗
                </a>
              )}
            </div>

            {/* Right: actions */}
            <div className="flex flex-wrap items-center gap-2">
              <LogDateSection
                recipeId={recipe.id}
                getToken={getAccessToken}
                onLogged={(date) => {
                  setDatesMade((prev) =>
                    prev.includes(date) ? prev : [date, ...prev].sort().reverse()
                  )
                }}
              />
              {isOwner && (
                <>
                  <Link
                    href={`/recipes/${recipe.id}/edit`}
                    className="font-display font-medium text-[13px] text-stone-600 border border-stone-200 rounded py-2 px-4 hover:bg-stone-50"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => setShowDelete(true)}
                    className="font-display font-medium text-[13px] text-red-500 border border-red-200 rounded py-2 px-4 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </>
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
    </div>
  )
}
