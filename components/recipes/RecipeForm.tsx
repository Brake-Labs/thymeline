'use client'

import { useState } from 'react'
import TagPill from './TagPill'

export interface RecipeFormValues {
  title: string
  category: 'main_dish' | 'breakfast' | 'dessert' | 'side_dish' | ''
  tags: string[]
  ingredients: string
  steps: string
  notes: string
  url: string
  image_url: string
}

interface RecipeFormProps {
  initialValues?: Partial<RecipeFormValues>
  /** Fields from a scrape that returned null — show "Couldn't find this" placeholder */
  nullFields?: Set<string>
  availableTags: string[]
  onSubmit: (values: RecipeFormValues) => Promise<void>
  isSubmitting: boolean
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'Select category...' },
  { value: 'main_dish', label: 'Main Dish' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'side_dish', label: 'Side Dish' },
]

const PLACEHOLDER = "Couldn't find this — add it manually"

export default function RecipeForm({
  initialValues = {},
  nullFields,
  availableTags,
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
  })
  const [errors, setErrors] = useState<{ title?: string; category?: string }>({})

  function set<K extends keyof RecipeFormValues>(field: K, value: RecipeFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }))
    if (field === 'title' || field === 'category') {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function addTag(tag: string) {
    if (!values.tags.includes(tag)) set('tags', [...values.tags, tag])
  }

  function removeTag(tag: string) {
    set('tags', values.tags.filter((t) => t !== tag))
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

  const unselectedTags = availableTags.filter((t) => !values.tags.includes(t))

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
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {errors.category && <p className="mt-1 text-xs text-red-500">{errors.category}</p>}
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
        <div className="flex flex-wrap gap-1 mb-2">
          {values.tags.map((tag) => (
            <TagPill key={tag} label={tag} onRemove={() => removeTag(tag)} />
          ))}
        </div>
        {unselectedTags.length > 0 && (
          <select
            value=""
            onChange={(e) => { if (e.target.value) addTag(e.target.value) }}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Add tag"
          >
            <option value="">Add tag...</option>
            {unselectedTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {/* Ingredients */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Ingredients</label>
        <textarea
          value={values.ingredients}
          onChange={(e) => set('ingredients', e.target.value)}
          placeholder={nullFields?.has('ingredients') ? PLACEHOLDER : 'One ingredient per line'}
          rows={6}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        className="w-full bg-blue-600 text-white py-2 px-4 rounded font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Saving…' : 'Save Recipe'}
      </button>
    </form>
  )
}
