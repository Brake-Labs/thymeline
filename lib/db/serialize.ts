/**
 * Serialization helpers: converts Drizzle ORM camelCase row objects to the
 * snake_case JSON format the frontend expects.
 *
 * Drizzle returns TypeScript property names (camelCase) but the frontend
 * types (Recipe, RecipeListItem) use snake_case, matching the old Supabase
 * PostgREST response format. These helpers bridge that gap at the API layer.
 */

import type { InferSelectModel } from 'drizzle-orm'
import type { recipes } from './schema'

type RecipeRow = InferSelectModel<typeof recipes>

interface RecipeRowWithHistory extends RecipeRow {
  last_made?: string | null
  times_made?: number
  dates_made?: string[]
}

/**
 * Serializes a full Drizzle recipe row (optionally with history fields) to the
 * snake_case JSON shape matching the frontend `Recipe` type.
 */
export function recipeRowToJson(r: RecipeRowWithHistory) {
  return {
    id: r.id,
    user_id: r.userId,
    household_id: r.householdId ?? null,
    title: r.title,
    url: r.url ?? null,
    category: r.category,
    tags: r.tags,
    notes: r.notes ?? null,
    is_shared: r.isShared,
    ingredients: r.ingredients ?? null,
    steps: r.steps ?? null,
    image_url: r.imageUrl ?? null,
    created_at: r.createdAt,
    prep_time_minutes: r.prepTimeMinutes ?? null,
    cook_time_minutes: r.cookTimeMinutes ?? null,
    total_time_minutes: r.totalTimeMinutes ?? null,
    inactive_time_minutes: r.inactiveTimeMinutes ?? null,
    servings: r.servings ?? null,
    source: r.source as 'scraped' | 'manual' | 'generated',
    step_photos: (r.stepPhotos ?? []) as { stepIndex: number; imageUrl: string }[],
    ...(r.last_made !== undefined ? { last_made: r.last_made } : {}),
    ...(r.times_made !== undefined ? { times_made: r.times_made } : {}),
    ...(r.dates_made !== undefined ? { dates_made: r.dates_made } : {}),
  }
}

interface RecipeListRow {
  id: string
  userId: string
  title: string
  category: string
  tags: string[]
  isShared: boolean
  createdAt: Date | string
  totalTimeMinutes: number | null
  last_made: string | null
  times_made: number
}

/**
 * Serializes a recipe list row (from the explicit-select query in GET /api/recipes)
 * to the snake_case JSON shape matching the frontend `RecipeListItem` type.
 */
export function recipeListItemToJson(r: RecipeListRow) {
  return {
    id: r.id,
    user_id: r.userId,
    title: r.title,
    category: r.category,
    tags: r.tags,
    is_shared: r.isShared,
    total_time_minutes: r.totalTimeMinutes ?? null,
    created_at: r.createdAt,
    last_made: r.last_made,
    times_made: r.times_made,
  }
}
