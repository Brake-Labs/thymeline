'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Recipe } from '@/types'
import RecipeForm, { RecipeFormValues } from '@/components/recipes/RecipeForm'

function getToken(): string {
  if (typeof window === 'undefined') return ''
  return (window as Window & { __supabaseToken?: string }).__supabaseToken ?? ''
}

interface Props {
  params: { id: string }
}

export default function EditRecipePage({ params }: Props) {
  const router = useRouter()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/recipes/${params.id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.json()
      })
      .then((data: Recipe | null) => {
        if (data) setRecipe(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [params.id])

  useEffect(() => {
    fetch('/api/tags', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) => {
        if (Array.isArray(data)) setAvailableTags(data.map((t) => t.name))
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(values: RecipeFormValues) {
    setSaveError(null)
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/recipes/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
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
        router.push(`/recipes/${params.id}`)
      } else {
        const err: { error?: string } = await res.json()
        setSaveError(err.error ?? 'Save failed')
      }
    } finally {
      setIsSubmitting(false)
    }
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Recipe</h1>

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
        }}
        availableTags={availableTags}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  )
}
