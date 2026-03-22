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
      <div className="max-w-3xl mx-auto px-4 py-8 text-stone-400" style={{ fontFamily: 'Manrope, sans-serif' }}>
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
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: '#F7F4F0' }}>
      <div className="max-w-3xl mx-auto">
        {/* Back link */}
        <Link
          href="/recipes"
          className="text-sm text-stone-500 hover:text-stone-700 mb-5 inline-block"
          style={{ fontFamily: 'Manrope, sans-serif' }}
        >
          ← All Recipes
        </Link>

        {/* Recipe card */}
        <div
          style={{
            backgroundColor: '#FFFDF9',
            border: '1px solid #D4C9BA',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          {/* Top accent bar */}
          <div style={{ height: '5px', backgroundColor: '#7A9E87' }} />

          {/* Hero image */}
          {recipe.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={recipe.image_url}
              alt={recipe.title}
              className="w-full object-cover"
              style={{ maxHeight: '280px' }}
            />
          )}

          {/* Header section */}
          <div className="px-6 pt-5 pb-4">
            {/* Category label */}
            <p
              className="text-stone-400 uppercase mb-1"
              style={{ fontSize: '10px', letterSpacing: '0.12em', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {CATEGORY_LABELS[recipe.category]}
            </p>

            {/* Title */}
            <h1
              className="font-bold text-stone-800 mb-3"
              style={{ fontSize: '22px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {recipe.title}
            </h1>

            {/* Times row */}
            <div className="flex flex-wrap gap-6">
              {timeItems.map(({ label, value }) => (
                <div key={label}>
                  <p
                    className="uppercase text-stone-400 mb-0.5"
                    style={{ fontSize: '9px', letterSpacing: '0.10em', fontFamily: 'Manrope, sans-serif' }}
                  >
                    {label}
                  </p>
                  <p
                    className="text-stone-700"
                    style={{ fontSize: '13px', fontFamily: 'Manrope, sans-serif' }}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Dashed divider */}
          <div style={{ borderTop: '1px dashed #D4C9BA', margin: '0 24px' }} />

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
                  ? <span className="text-sm text-stone-400" style={{ fontFamily: 'Manrope, sans-serif' }}>No tags</span>
                  : recipe.tags.map((t) => <TagPill key={t} label={t} />)}
              </div>
            )}
          </div>

          {/* Dashed divider */}
          <div style={{ borderTop: '1px dashed #D4C9BA', margin: '0 24px' }} />

          {/* Body: two-column grid */}
          <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: Ingredients */}
            <div>
              <h2
                className="font-semibold text-stone-700 mb-3"
                style={{ fontSize: '13px', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.04em' }}
              >
                Ingredients
              </h2>
              {recipe.ingredients ? (
                <ul>
                  {recipe.ingredients.split('\n').filter(Boolean).map((line, i, arr) => (
                    <li
                      key={i}
                      className="py-2 text-stone-700"
                      style={{
                        fontSize: '13px',
                        fontFamily: 'Manrope, sans-serif',
                        borderBottom: i < arr.length - 1 ? '1px solid #EDE6DC' : 'none',
                      }}
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-stone-400 text-sm" style={{ fontFamily: 'Manrope, sans-serif' }}>No ingredients listed.</p>
              )}
            </div>

            {/* Right: Steps */}
            <div>
              <h2
                className="font-semibold text-stone-700 mb-3"
                style={{ fontSize: '13px', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.04em' }}
              >
                Steps
              </h2>
              {recipe.steps ? (
                <ol className="space-y-3">
                  {recipe.steps.split('\n').filter(Boolean).map((line, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span
                        className="flex-shrink-0 flex items-center justify-center text-white font-semibold"
                        style={{
                          width: '20px',
                          height: '20px',
                          minWidth: '20px',
                          borderRadius: '50%',
                          backgroundColor: '#7A9E87',
                          fontSize: '10px',
                          fontFamily: 'Plus Jakarta Sans, sans-serif',
                          marginTop: '1px',
                        }}
                      >
                        {i + 1}
                      </span>
                      <span
                        className="text-stone-700"
                        style={{ fontSize: '13px', fontFamily: 'Manrope, sans-serif' }}
                      >
                        {line}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-stone-400 text-sm" style={{ fontFamily: 'Manrope, sans-serif' }}>No steps listed.</p>
              )}
            </div>
          </div>

          {/* Notes section */}
          {recipe.notes && (
            <>
              <div style={{ borderTop: '1px dashed #D4C9BA', margin: '0 24px' }} />
              <div className="px-6 py-4">
                <h2
                  className="font-semibold text-stone-700 mb-2"
                  style={{ fontSize: '13px', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.04em' }}
                >
                  Notes
                </h2>
                <p
                  className="text-stone-500 whitespace-pre-wrap"
                  style={{ fontSize: '13px', fontFamily: 'Manrope, sans-serif' }}
                >
                  {recipe.notes}
                </p>
              </div>
            </>
          )}

          {/* Share toggle — owner only */}
          {isOwner && (
            <>
              <div style={{ borderTop: '1px dashed #D4C9BA', margin: '0 24px' }} />
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
          <div style={{ borderTop: '1px dashed #D4C9BA', margin: '0 24px' }} />

          {/* Footer */}
          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
            {/* Left: last made + source */}
            <div className="flex flex-col gap-0.5">
              <p
                className="text-stone-400"
                style={{ fontSize: '11px', fontFamily: 'Manrope, sans-serif' }}
              >
                {lastMadeLabel}
              </p>
              {recipe.url && (
                <a
                  href={recipe.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-stone-400 hover:text-stone-600 hover:underline"
                  style={{ fontSize: '11px', fontFamily: 'Manrope, sans-serif' }}
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
                    className="py-2 px-4 rounded border text-stone-600 hover:bg-stone-50"
                    style={{
                      fontFamily: 'Plus Jakarta Sans, sans-serif',
                      border: '1px solid #D4C9BA',
                      fontSize: '13px',
                      fontWeight: '500',
                    }}
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => setShowDelete(true)}
                    className="py-2 px-4 rounded border text-red-500 hover:bg-red-50"
                    style={{
                      fontFamily: 'Plus Jakarta Sans, sans-serif',
                      border: '1px solid #FECACA',
                      fontSize: '13px',
                      fontWeight: '500',
                    }}
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
