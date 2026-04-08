'use client'

import { useState } from 'react'
import GenerateRecipeTab, { GenerationContext } from './GenerateRecipeTab'
import GenerateRecipeChatPanel from './GenerateRecipeChatPanel'
import RecipeForm, { RecipeFormValues } from './RecipeForm'
import AIGeneratedBadge from './AIGeneratedBadge'
import type { GeneratedRecipe } from '@/types'

type GenerateStep = 'input' | 'refining' | 'finalized'

interface Props {
  onClose:             () => void
  onSaved:             () => void
  initialIngredients?: string
}

export default function GenerateRecipeModal({
  onClose,
  onSaved,
  initialIngredients,
}: Props) {
  const [generateStep, setGenerateStep]           = useState<GenerateStep>('input')
  const [draftRecipe, setDraftRecipe]             = useState<GeneratedRecipe | null>(null)
  const [generationContext, setGenerationContext] = useState<GenerationContext | null>(null)
  const [isSubmitting, setIsSubmitting]           = useState(false)
  const [saveError, setSaveError]                 = useState<string | null>(null)

  function handleGenerated(recipe: GeneratedRecipe, context: GenerationContext) {
    setDraftRecipe(recipe)
    setGenerationContext(context)
    setGenerateStep('refining')
  }

  function handleUseRecipe(recipe: GeneratedRecipe) {
    setDraftRecipe(recipe)
    setGenerateStep('finalized')
  }

  function handleStartOver() {
    setDraftRecipe(null)
    setGenerationContext(null)
    setGenerateStep('input')
  }

  async function handleSubmit(values: RecipeFormValues) {
    setIsSubmitting(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:                 values.title,
          category:              values.category || undefined,
          tags:                  values.tags,
          ingredients:           values.ingredients || null,
          steps:                 values.steps || null,
          notes:                 values.notes || null,
          url:                   values.url || null,
          image_url:             values.image_url || null,
          prep_time_minutes:     values.prep_time_minutes !== '' ? Number(values.prep_time_minutes) : null,
          cook_time_minutes:     values.cook_time_minutes !== '' ? Number(values.cook_time_minutes) : null,
          total_time_minutes:    values.total_time_minutes !== '' ? Number(values.total_time_minutes) : null,
          inactive_time_minutes: values.inactive_time_minutes !== '' ? Number(values.inactive_time_minutes) : null,
          servings:              values.servings !== '' ? Number(values.servings) : null,
          source:                'generated',
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ made_on: values.lastMade }),
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formInitialValues: Partial<RecipeFormValues> = draftRecipe
    ? {
        title:                 draftRecipe.title,
        category:              draftRecipe.category,
        tags:                  draftRecipe.tags,
        ingredients:           draftRecipe.ingredients ?? '',
        steps:                 draftRecipe.steps ?? '',
        notes:                 draftRecipe.notes ?? '',
        prep_time_minutes:     draftRecipe.prep_time_minutes  != null ? String(draftRecipe.prep_time_minutes)  : '',
        cook_time_minutes:     draftRecipe.cook_time_minutes  != null ? String(draftRecipe.cook_time_minutes)  : '',
        total_time_minutes:    draftRecipe.total_time_minutes != null ? String(draftRecipe.total_time_minutes) : '',
        inactive_time_minutes: draftRecipe.inactive_time_minutes != null ? String(draftRecipe.inactive_time_minutes) : '',
        servings:              draftRecipe.servings != null ? String(draftRecipe.servings) : '',
      }
    : {}

  const headerTitle =
    generateStep === 'input'    ? 'Generate Recipe with AI' :
    generateStep === 'refining' ? 'Refine Your Recipe'      :
                                  'Review Generated Recipe'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-display text-lg font-semibold text-gray-900">
            {headerTitle}
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
          {/* Always mounted — CSS-hidden when not active so form state is preserved */}
          <div className={generateStep === 'input' ? '' : 'hidden'}>
            <GenerateRecipeTab
              onGenerated={handleGenerated}
              initialIngredients={initialIngredients}
            />
          </div>

          {generateStep === 'refining' && draftRecipe && generationContext && (
            <GenerateRecipeChatPanel
              initialRecipe={draftRecipe}
              generationContext={generationContext}
              onUseRecipe={handleUseRecipe}
              onStartOver={handleStartOver}
            />
          )}

          {generateStep === 'finalized' && draftRecipe && (
            <div className="space-y-4">
              <AIGeneratedBadge />
              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {saveError}
                </p>
              )}
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
