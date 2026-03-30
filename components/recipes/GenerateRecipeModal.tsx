'use client'

import { useState } from 'react'
import GenerateRecipeTab from './GenerateRecipeTab'
import RecipeForm, { RecipeFormValues } from './RecipeForm'
import AIGeneratedBadge from './AIGeneratedBadge'
import type { GeneratedRecipe } from '@/types'

interface Props {
  onClose:                  () => void
  onSaved:                  () => void
  getToken:                 () => Promise<string> | string
  initialIngredients?:      string
  initialPantryEnabled?:    boolean
}

export default function GenerateRecipeModal({
  onClose,
  onSaved,
  getToken,
  initialIngredients,
  initialPantryEnabled,
}: Props) {
  const [generatedRecipe, setGeneratedRecipe] = useState<GeneratedRecipe | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(values: RecipeFormValues) {
    setIsSubmitting(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: values.title,
          category: values.category || undefined,
          tags: values.tags,
          ingredients: values.ingredients || null,
          steps: values.steps || null,
          notes: values.notes || null,
          url: values.url || null,
          image_url: values.image_url || null,
          prep_time_minutes: values.prep_time_minutes !== '' ? Number(values.prep_time_minutes) : null,
          cook_time_minutes: values.cook_time_minutes !== '' ? Number(values.cook_time_minutes) : null,
          total_time_minutes: values.total_time_minutes !== '' ? Number(values.total_time_minutes) : null,
          inactive_time_minutes: values.inactive_time_minutes !== '' ? Number(values.inactive_time_minutes) : null,
          servings: values.servings !== '' ? Number(values.servings) : null,
          source: 'generated',
        }),
      })
      if (!res.ok) {
        const err: { error?: string } = await res.json()
        throw new Error(err.error ?? 'Save failed')
      }
      const created: { id: string } = await res.json()
      if (values.lastMade && created.id) {
        await fetch(`/api/recipes/${created.id}/log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ made_on: values.lastMade }),
        })
      }
      onSaved()
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const formInitialValues: Partial<RecipeFormValues> = generatedRecipe
    ? {
        title: generatedRecipe.title,
        category: generatedRecipe.category,
        tags: generatedRecipe.tags,
        ingredients: generatedRecipe.ingredients ?? '',
        steps: generatedRecipe.steps ?? '',
        notes: generatedRecipe.notes ?? '',
        prep_time_minutes: generatedRecipe.prep_time_minutes != null ? String(generatedRecipe.prep_time_minutes) : '',
        cook_time_minutes: generatedRecipe.cook_time_minutes != null ? String(generatedRecipe.cook_time_minutes) : '',
        total_time_minutes: generatedRecipe.total_time_minutes != null ? String(generatedRecipe.total_time_minutes) : '',
        inactive_time_minutes: generatedRecipe.inactive_time_minutes != null ? String(generatedRecipe.inactive_time_minutes) : '',
        servings: generatedRecipe.servings != null ? String(generatedRecipe.servings) : '',
      }
    : {}

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-display text-lg font-semibold text-gray-900">
            {generatedRecipe ? 'Review Generated Recipe' : 'Generate Recipe with AI'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 flex-1">
          {!generatedRecipe ? (
            <GenerateRecipeTab
              getToken={getToken}
              onGenerated={setGeneratedRecipe}
              initialPantryEnabled={initialPantryEnabled}
              initialIngredients={initialIngredients}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <AIGeneratedBadge />
                <button
                  type="button"
                  onClick={() => setGeneratedRecipe(null)}
                  className="text-xs text-stone-500 border border-stone-200 rounded-lg px-3 py-1 hover:bg-stone-50"
                >
                  Regenerate
                </button>
              </div>
              <RecipeForm
                initialValues={formInitialValues}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
