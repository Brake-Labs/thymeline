'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Recipe } from '@/types'
import { CATEGORY_LABELS } from '@/lib/category-labels'
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
    getSupabaseClient().auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user?.id ?? '')
    })
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
    return <div className="max-w-2xl mx-auto px-4 py-8 text-gray-400">Loading…</div>
  }

  if (notFound || !recipe) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-gray-500">Recipe not found.</p>
        <Link href="/recipes" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
          ← Back to recipes
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link href="/recipes" className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        ← All Recipes
      </Link>

      {/* Hero image */}
      {recipe.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={recipe.image_url}
          alt={recipe.title}
          className="w-full h-56 object-cover rounded-lg mb-6"
        />
      )}

      {/* Title + meta */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{recipe.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span>{CATEGORY_LABELS[recipe.category]}</span>
          {recipe.url && (
            <a
              href={recipe.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline truncate max-w-xs"
            >
              Source
            </a>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tags</h2>
        {isOwner ? (
          <InlineTagEditor
            recipeId={recipe.id}
            currentTags={recipe.tags}
            availableTags={availableTags}
            getToken={getAccessToken}
            onUpdate={(tags) => setRecipe((r) => r ? { ...r, tags } : r)}
          />
        ) : (
          <div className="flex flex-wrap gap-1">
            {recipe.tags.length === 0
              ? <span className="text-sm text-gray-400">No tags</span>
              : recipe.tags.map((t) => <TagPill key={t} label={t} />)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-8">
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
              className="py-3 px-5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Edit
            </Link>
            <button
              onClick={() => setShowDelete(true)}
              className="py-3 px-5 rounded-lg border border-red-300 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </>
        )}
      </div>

      {/* Dates made */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Dates Made</h2>
        {datesMade.length === 0 ? (
          <p className="text-sm text-gray-400">Never made</p>
        ) : (
          <ul className="space-y-1">
            {datesMade.map((date) => (
              <li key={date} className="text-sm text-gray-700">{date}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Share toggle — owner only */}
      {isOwner && (
        <div className="mb-8">
          <ShareToggle
            recipeId={recipe.id}
            initialIsShared={recipe.is_shared}
            getToken={getAccessToken}
            onUpdate={(isShared) => setRecipe((r) => r ? { ...r, is_shared: isShared } : r)}
          />
        </div>
      )}

      {/* Ingredients */}
      {recipe.ingredients && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Ingredients</h2>
          <ul className="space-y-1">
            {recipe.ingredients.split('\n').filter(Boolean).map((line, i) => (
              <li key={i} className="text-sm text-gray-700 flex gap-2">
                <span className="text-gray-300 select-none">•</span>
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Steps */}
      {recipe.steps && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Steps</h2>
          <ol className="space-y-3">
            {recipe.steps.split('\n').filter(Boolean).map((line, i) => (
              <li key={i} className="text-sm text-gray-700 flex gap-3">
                <span className="font-semibold text-gray-400 min-w-[1.25rem]">{i + 1}.</span>
                {line}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Notes */}
      {recipe.notes && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{recipe.notes}</p>
        </section>
      )}

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
