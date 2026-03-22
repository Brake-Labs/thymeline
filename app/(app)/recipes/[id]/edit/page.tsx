'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Recipe } from '@/types'
import RecipeForm, { RecipeFormValues } from '@/components/recipes/RecipeForm'
import { getAccessToken } from '@/lib/supabase/browser'

interface Props {
  params: { id: string }
}

export default function EditRecipePage({ params }: Props) {
  const router = useRouter()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Dates made state
  const [datesMade, setDatesMade] = useState<string[]>([])
  const [addDateValue, setAddDateValue] = useState('')
  const [dateError, setDateError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRecipe() {
      try {
        const r = await fetch(`/api/recipes/${params.id}`, {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
        })
        if (r.status === 404) { setNotFound(true); setLoading(false); return }
        const data: Recipe = await r.json()
        if (data) {
          setRecipe(data)
          setDatesMade(data.dates_made ?? [])
        }
        setLoading(false)
      } catch {
        setLoading(false)
      }
    }
    fetchRecipe()
  }, [params.id])

  async function handleSubmit(values: RecipeFormValues) {
    setSaveError(null)
    setIsSubmitting(true)
    try {
      const token = await getAccessToken()
      const res = await fetch(`/api/recipes/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: values.title,
          category: values.category || undefined,
          tags: values.tags,
          ingredients: values.ingredients || null,
          steps: values.steps || null,
          notes: values.notes || null,
          url: values.url || null,
          image_url: values.image_url || null,
        }),
      })
      if (res.ok) {
        if (values.lastMade) {
          const logRes = await fetch(`/api/recipes/${params.id}/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ made_on: values.lastMade }),
          })
          if (logRes.ok) {
            const logData: { made_on: string; already_logged: boolean } = await logRes.json()
            if (!logData.already_logged) {
              setDatesMade((prev) => [...prev, logData.made_on].sort().reverse())
            }
          }
        }
        router.push(`/recipes/${params.id}`)
      } else {
        const err: { error?: string } = await res.json()
        setSaveError(err.error ?? 'Save failed')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAddDate() {
    if (!addDateValue) return
    setDateError(null)
    const token = await getAccessToken()
    const res = await fetch(`/api/recipes/${params.id}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ made_on: addDateValue }),
    })
    if (res.ok) {
      const data: { made_on: string; already_logged: boolean } = await res.json()
      if (data.already_logged) {
        setDateError('Already logged for that day')
      } else {
        setDatesMade((prev) => [...prev, data.made_on].sort().reverse())
        setAddDateValue('')
      }
    }
  }

  async function handleRemoveDate(date: string) {
    const token = await getAccessToken()
    await fetch(`/api/recipes/${params.id}/log`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ made_on: date }),
    })
    setDatesMade((prev) => prev.filter((d) => d !== date))
  }

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
      <Link
        href={`/recipes/${recipe.id}`}
        className="text-sm text-blue-600 hover:underline mb-4 inline-block"
      >
        ← Back to recipe
      </Link>
      <h1 className="font-display text-2xl font-bold text-gray-900 mb-6">Edit Recipe</h1>

      {saveError && (
        <p className="mb-4 text-sm text-red-500">{saveError}</p>
      )}

      <RecipeForm
        initialValues={{
          title: recipe.title,
          category: recipe.category,
          tags: recipe.tags,
          ingredients: recipe.ingredients ?? '',
          steps: recipe.steps ?? '',
          notes: recipe.notes ?? '',
          url: recipe.url ?? '',
          image_url: recipe.image_url ?? '',
          lastMade: '',
        }}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Dates made */}
      <div className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="font-display text-sm font-medium text-gray-700 mb-3">Dates Made</h2>

        <div className="flex items-center gap-2 mb-3">
          <input
            type="date"
            value={addDateValue}
            onChange={(e) => { setAddDateValue(e.target.value); setDateError(null) }}
            max={new Date().toISOString().split('T')[0]}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleAddDate}
            disabled={!addDateValue}
            className="px-3 py-1.5 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
        {dateError && <p className="text-xs text-yellow-600 mb-2">{dateError}</p>}

        {datesMade.length === 0 ? (
          <p className="text-sm text-gray-400">No dates logged yet.</p>
        ) : (
          <ul className="space-y-1">
            {datesMade.map((date) => (
              <li key={date} className="flex items-center justify-between text-sm text-gray-700">
                <span>{date}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveDate(date)}
                  className="text-xs text-red-400 hover:text-red-600"
                  aria-label={`Remove date ${date}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
