'use client'

import { useState } from 'react'
import TagSelector, { type PendingNewTag } from './TagSelector'
import { CATEGORY_OPTIONS } from '@/lib/category-labels'

export interface RecipeFormValues {
  title: string
  category: 'main_dish' | 'breakfast' | 'dessert' | 'side_dish' | ''
  tags: string[]
  ingredients: string
  steps: string
  notes: string
  url: string
  image_url: string
  lastMade: string  // ISO date string, optional — '' means not set
  prep_time_minutes: string   // stored as string in form, converted to int | null on submit
  cook_time_minutes: string
  total_time_minutes: string
  inactive_time_minutes: string
  servings: string
}

interface RecipeFormProps {
  initialValues?: Partial<RecipeFormValues>
  /** Fields from a scrape that returned null — show "Couldn't find this" placeholder */
  nullFields?: Set<string>
  suggestedTags?:   string[]
  pendingNewTags?:  PendingNewTag[]
  onSubmit: (values: RecipeFormValues) => Promise<void>
  isSubmitting: boolean
}

const FORM_CATEGORY_OPTIONS = [
  { value: '' as const, label: 'Select category...' },
  ...CATEGORY_OPTIONS,
]

const PLACEHOLDER = "Couldn't find this — add it manually"

export default function RecipeForm({
  initialValues = {},
  nullFields,
  suggestedTags,
  pendingNewTags,
  onSubmit,
  isSubmitting,
}: RecipeFormProps) {
  const [values, setValues] = useState<RecipeFormValues>({
    title: initialValues.title ?? '',
    category: initialValues.category ?? '',
    tags: initialValues.tags ?? [],
    ingredients: initialValues.ingredients ?? '',
    steps: initialValues.steps ?? '',
    notes: initialValues.notes ?? '',
    url: initialValues.url ?? '',
    image_url: initialValues.image_url ?? '',
    lastMade: initialValues.lastMade ?? '',
    prep_time_minutes: initialValues.prep_time_minutes ?? '',
    cook_time_minutes: initialValues.cook_time_minutes ?? '',
    total_time_minutes: initialValues.total_time_minutes ?? '',
    inactive_time_minutes: initialValues.inactive_time_minutes ?? '',
    servings: initialValues.servings ?? '',
  })
  const [errors, setErrors] = useState<{ title?: string; category?: string }>({})

  function set<K extends keyof RecipeFormValues>(field: K, value: RecipeFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }))
    if (field === 'title' || field === 'category') {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: typeof errors = {}
    if (!values.title.trim()) newErrors.title = 'Title is required'
    if (!values.category) newErrors.category = 'Category is required'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    await onSubmit(values)
  }


  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder={nullFields?.has('title') ? PLACEHOLDER : 'Recipe title'}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
        />
        {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Category <span className="text-red-500">*</span>
        </label>
        <select
          value={values.category}
          onChange={(e) => set('category', e.target.value as RecipeFormValues['category'])}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sage-500"
        >
          {FORM_CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {errors.category && <p className="mt-1 text-xs text-red-500">{errors.category}</p>}
      </div>

      {/* Time fields + Servings */}
      <div className="grid grid-cols-2 gap-4">
        {(
          [
            { field: 'prep_time_minutes', label: 'Prep time (min)' },
            { field: 'cook_time_minutes', label: 'Cook time (min)' },
            { field: 'total_time_minutes', label: 'Total time (min)' },
            { field: 'inactive_time_minutes', label: 'Inactive time (min)' },
          ] as const
        ).map(({ field, label }) => (
          <div key={field}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
              type="number"
              min={0}
              step={1}
              value={values[field]}
              onChange={(e) => set(field, e.target.value)}
              placeholder="—"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
            />
            <p className="mt-0.5 text-xs text-gray-400">Enter time in minutes</p>
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Servings</label>
          <input
            type="number"
            min={1}
            step={1}
            value={values.servings}
            onChange={(e) => set('servings', e.target.value)}
            placeholder="—"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
          />
          <p className="mt-0.5 text-xs text-gray-400">Number of servings this recipe makes</p>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
        <TagSelector
          selected={values.tags}
          suggested={suggestedTags}
          pendingNew={pendingNewTags}
          onChange={(tags) => set('tags', tags)}
        />
      </div>

      {/* Ingredients */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Ingredients</label>
        <textarea
          value={values.ingredients}
          onChange={(e) => set('ingredients', e.target.value)}
          placeholder={nullFields?.has('ingredients') ? PLACEHOLDER : 'One ingredient per line'}
          rows={6}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
        />
      </div>

      {/* Steps */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Steps</label>
        <textarea
          value={values.steps}
          onChange={(e) => set('steps', e.target.value)}
          placeholder={nullFields?.has('steps') ? PLACEHOLDER : 'One step per line'}
          rows={8}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder={nullFields?.has('notes') ? PLACEHOLDER : 'Personal notes'}
          rows={3}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
        />
      </div>

      {/* Source URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Source URL</label>
        <input
          type="url"
          value={values.url}
          onChange={(e) => set('url', e.target.value)}
          placeholder="https://..."
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
        />
      </div>

      {/* Last made (optional) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Last made <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="date"
          value={values.lastMade}
          onChange={(e) => set('lastMade', e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
        />
      </div>

      {/* Hero image */}
      {values.image_url && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hero Image</label>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={values.image_url}
            alt="Recipe hero"
            className="h-40 w-auto rounded object-cover mb-2"
          />
          <button
            type="button"
            onClick={() => set('image_url', '')}
            className="text-xs text-red-500 hover:underline"
          >
            Remove
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-sage-500 text-white py-2 px-4 rounded font-medium text-sm hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Saving…' : 'Save Recipe'}
      </button>
    </form>
  )
}
