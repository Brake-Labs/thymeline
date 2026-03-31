'use client'

import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/browser'
import { DIETARY_TAGS } from '@/lib/tags'
import type { GeneratedRecipe, MealType, PantryItem } from '@/types'

interface GenerateRecipeTabProps {
  getToken:               () => Promise<string> | string
  onGenerated:            (recipe: GeneratedRecipe) => void
  initialPantryEnabled?:  boolean
  initialIngredients?:    string
}

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch',     label: 'Lunch' },
  { value: 'dinner',    label: 'Dinner' },
  { value: 'snack',     label: 'Snack' },
  { value: 'dessert',   label: 'Dessert' },
]

export default function GenerateRecipeTab({
  getToken,
  onGenerated,
  initialPantryEnabled = false,
  initialIngredients = '',
}: GenerateRecipeTabProps) {
  const [pantryEnabled, setPantryEnabled] = useState(initialPantryEnabled)
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([])
  const [pantryLoading, setPantryLoading] = useState(false)
  const [pantryExpanded, setPantryExpanded] = useState(false)
  const [specificIngredients, setSpecificIngredients] = useState(initialIngredients)
  const [mealType, setMealType] = useState<MealType>('dinner')
  const [styleHints, setStyleHints] = useState('')
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-populate dietary restrictions from user preferences
  useEffect(() => {
    async function prefillDietary() {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('user_preferences')
        .select('avoided_tags')
        .eq('user_id', user.id)
        .single()
      if (data?.avoided_tags) {
        const preChecked = data.avoided_tags.filter((t: string) =>
          (DIETARY_TAGS as readonly string[]).includes(t)
        )
        setDietaryRestrictions(preChecked)
      }
    }
    prefillDietary()
  }, [])

  // Fetch pantry items when pantryEnabled first flips true
  useEffect(() => {
    if (!pantryEnabled || pantryItems.length > 0) return
    async function fetchPantry() {
      setPantryLoading(true)
      try {
        const token = await getToken()
        const res = await fetch('/api/pantry', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setPantryItems(data.items ?? [])
        }
      } finally {
        setPantryLoading(false)
      }
    }
    fetchPantry()
  }, [pantryEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  const canGenerate = pantryEnabled || specificIngredients.trim().length > 0

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch('/api/recipes/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          use_pantry:           pantryEnabled,
          specific_ingredients: specificIngredients,
          meal_type:            mealType,
          style_hints:          styleHints,
          dietary_restrictions: dietaryRestrictions,
        }),
      })
      if (!res.ok) {
        setError("Couldn't generate a recipe — try adjusting your ingredients")
        return
      }
      const recipe: GeneratedRecipe = await res.json()
      onGenerated(recipe)
    } catch {
      setError("Couldn't generate a recipe — try adjusting your ingredients")
    } finally {
      setGenerating(false)
    }
  }

  function toggleDietary(tag: string) {
    setDietaryRestrictions((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  return (
    <div className="space-y-5">
      {/* Pantry toggle */}
      <div className="border border-stone-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={pantryEnabled}
              onClick={() => setPantryEnabled((v) => !v)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                pantryEnabled ? 'bg-sage-500' : 'bg-stone-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  pantryEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm font-medium text-stone-700">Use my pantry ingredients</span>
          </div>
          {pantryEnabled && (
            <button
              type="button"
              onClick={() => setPantryExpanded((v) => !v)}
              className="text-xs text-stone-500 hover:text-stone-700"
            >
              {pantryLoading
                ? 'Loading…'
                : `Using ${pantryItems.length} pantry items ${pantryExpanded ? '▴' : '▾'}`}
            </button>
          )}
        </div>
        {pantryEnabled && pantryExpanded && pantryItems.length > 0 && (
          <ul className="max-h-32 overflow-y-auto space-y-1">
            {pantryItems.map((item) => (
              <li key={item.id} className="text-xs text-stone-600">
                {item.quantity ? `${item.quantity} ` : ''}{item.name}
              </li>
            ))}
          </ul>
        )}
        {pantryEnabled && !pantryLoading && pantryItems.length === 0 && (
          <p className="text-xs text-stone-400">Your pantry is empty. Add items there first.</p>
        )}
      </div>

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
    </div>
  )
}
