'use client'

import { useEffect, useState } from 'react'
import { Leaf } from 'lucide-react'
import { DIETARY_TAGS } from '@/lib/tags'
import type { GeneratedRecipe, MealType } from '@/types'

export interface GenerationContext {
  mealType:            string
  styleHints:          string
  dietaryRestrictions: string[]
}

interface GenerateRecipeTabProps {
  onGenerated:         (recipe: GeneratedRecipe, context: GenerationContext) => void
  initialIngredients?: string
}

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch',     label: 'Lunch' },
  { value: 'dinner',    label: 'Dinner' },
  { value: 'snack',     label: 'Snack' },
  { value: 'dessert',   label: 'Dessert' },
]

export default function GenerateRecipeTab({
  onGenerated,
  initialIngredients = '',
}: GenerateRecipeTabProps) {
  const [specificIngredients, setSpecificIngredients] = useState(initialIngredients)
  const [mealType, setMealType] = useState<MealType>('dinner')
  const [styleHints, setStyleHints] = useState('')
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedRecipe, setGeneratedRecipe] = useState<GeneratedRecipe | null>(null)
  const [tweakInput, setTweakInput] = useState('')
  const [tweaking, setTweaking] = useState(false)
  const [tweakError, setTweakError] = useState<string | null>(null)

  // Pre-populate dietary restrictions from user preferences
  useEffect(() => {
    async function prefillDietary() {
      try {
        const res = await fetch('/api/preferences')
        if (!res.ok) return
        const data = await res.json()
        if (data?.avoidedTags) {
          const preChecked = data.avoidedTags.filter((t: string) =>
            (DIETARY_TAGS as readonly string[]).includes(t)
          )
          setDietaryRestrictions(preChecked)
        }
      } catch { /* non-fatal */ }
    }
    prefillDietary()
  }, [])

  const canGenerate = specificIngredients.trim().length > 0

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/recipes/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          specificIngredients: specificIngredients,
          mealType:            mealType,
          styleHints:          styleHints,
          dietaryRestrictions: dietaryRestrictions,
        }),
      })
      if (!res.ok) {
        setError("Couldn't generate a recipe — try adjusting your ingredients")
        return
      }
      const recipe: GeneratedRecipe = await res.json()
      setGeneratedRecipe(recipe)
      onGenerated(recipe, { mealType: mealType, styleHints: styleHints, dietaryRestrictions: dietaryRestrictions })
    } catch {
      setError("Couldn't generate a recipe — try adjusting your ingredients")
    } finally {
      setGenerating(false)
    }
  }

  async function handleTweak() {
    if (!generatedRecipe || !tweakInput.trim()) return
    setTweaking(true)
    setTweakError(null)
    try {
      const res = await fetch('/api/recipes/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          specificIngredients: specificIngredients,
          mealType:            mealType,
          styleHints:          styleHints,
          dietaryRestrictions: dietaryRestrictions,
          tweakRequest:        tweakInput.trim(),
          previousRecipe: {
            title:       generatedRecipe.title,
            ingredients: generatedRecipe.ingredients ?? '',
            steps:       generatedRecipe.steps ?? '',
          },
        }),
      })
      if (!res.ok) {
        setTweakError("Couldn't update the recipe — please try again")
        return
      }
      const recipe: GeneratedRecipe = await res.json()
      setGeneratedRecipe(recipe)
      setTweakInput('')
      onGenerated(recipe, { mealType: mealType, styleHints: styleHints, dietaryRestrictions: dietaryRestrictions })
    } catch {
      setTweakError("Couldn't update the recipe — please try again")
    } finally {
      setTweaking(false)
    }
  }

  function toggleDietary(tag: string) {
    setDietaryRestrictions((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  return (
    <div className="space-y-5">
      {/* Specific ingredients */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Ingredients to use
        </label>
        <textarea
          value={specificIngredients}
          onChange={(e) => setSpecificIngredients(e.target.value)}
          maxLength={500}
          rows={4}
          placeholder="e.g. chicken breast, zucchini, lemon (comma or line separated)"
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-400 resize-none"
        />
        {specificIngredients.length > 400 && (
          <p className="text-xs text-stone-400 text-right mt-0.5">
            {specificIngredients.length}/500
          </p>
        )}
      </div>

      {/* Meal type pills */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Meal type</label>
        <div className="flex flex-wrap gap-2">
          {MEAL_TYPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMealType(value)}
              className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                mealType === value
                  ? 'bg-stone-800 text-white border-stone-800'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Style hints */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Cuisine / style hints <span className="text-stone-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={styleHints}
          onChange={(e) => setStyleHints(e.target.value)}
          maxLength={100}
          placeholder="e.g. Italian, quick weeknight, spicy"
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-400"
        />
      </div>

      {/* Dietary restrictions */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">
          Dietary restrictions <span className="text-stone-400 font-normal">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {(DIETARY_TAGS as readonly string[]).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleDietary(tag)}
              className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                dietaryRestrictions.includes(tag)
                  ? 'bg-stone-800 text-white border-stone-800'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate || generating}
        className="w-full bg-sage-600 text-white rounded-xl py-3 font-display font-semibold text-sm hover:bg-sage-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {generating ? (
          <>
            <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Generating your recipe…
          </>
        ) : (
          'Generate recipe'
        )}
      </button>

      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      {generatedRecipe && (
        <div className="border border-stone-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-stone-800">{generatedRecipe.title}</p>
          {generatedRecipe.wasteBadgeText && (
            <div
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: '#FFF0C0', color: '#5C4A00' }}
            >
              <Leaf size={10} className="flex-shrink-0" />
              {generatedRecipe.wasteBadgeText}
            </div>
          )}
          <label className="block text-sm font-medium text-stone-700">
            Want to adjust anything?
          </label>
          <input
            type="text"
            value={tweakInput}
            onChange={(e) => setTweakInput(e.target.value)}
            maxLength={200}
            placeholder="e.g. I don't have chickpeas, remove the spice, add spinach…"
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-400"
            onKeyDown={(e) => { if (e.key === 'Enter' && !tweaking) handleTweak() }}
          />
          <button
            type="button"
            onClick={handleTweak}
            disabled={!tweakInput.trim() || tweaking}
            className="w-full border border-sage-500 text-sage-700 rounded-xl py-2.5 font-display font-semibold text-sm hover:bg-sage-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {tweaking ? (
              <>
                <span className="inline-block h-4 w-4 border-2 border-sage-500 border-t-transparent rounded-full animate-spin" />
                Updating recipe…
              </>
            ) : (
              'Regenerate with tweaks'
            )}
          </button>
          {tweakError && (
            <p className="text-sm text-red-500">{tweakError}</p>
          )}
        </div>
      )}
    </div>
  )
}
