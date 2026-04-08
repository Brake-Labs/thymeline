/**
 * Serialization helpers: normalizes Drizzle ORM row objects for API responses.
 *
 * Handles null coalescing for optional fields and type casting where Drizzle's
 * inferred types don't exactly match the frontend types.
 */

import type { InferSelectModel } from 'drizzle-orm'
import type { recipes } from './schema'

type RecipeRow = InferSelectModel<typeof recipes>

interface RecipeRowWithHistory extends RecipeRow {
  lastMade?: string | null
  timesMade?: number
  datesMade?: string[]
}

/**
 * Normalizes a full Drizzle recipe row (optionally with history fields)
 * for API response, applying null defaults and type casts.
 */
export function recipeRowToJson(r: RecipeRowWithHistory) {
  return {
    id: r.id,
    userId: r.userId,
    householdId: r.householdId ?? null,
    title: r.title,
    url: r.url ?? null,
    category: r.category,
    tags: r.tags,
    notes: r.notes ?? null,
    isShared: r.isShared,
    ingredients: r.ingredients ?? null,
    steps: r.steps ?? null,
    imageUrl: r.imageUrl ?? null,
    createdAt: r.createdAt,
    prepTimeMinutes: r.prepTimeMinutes ?? null,
    cookTimeMinutes: r.cookTimeMinutes ?? null,
    totalTimeMinutes: r.totalTimeMinutes ?? null,
    inactiveTimeMinutes: r.inactiveTimeMinutes ?? null,
    servings: r.servings ?? null,
    source: r.source as 'scraped' | 'manual' | 'generated',
    stepPhotos: (r.stepPhotos ?? []) as { stepIndex: number; imageUrl: string }[],
    ...(r.lastMade !== undefined ? { lastMade: r.lastMade } : {}),
    ...(r.timesMade !== undefined ? { timesMade: r.timesMade } : {}),
    ...(r.datesMade !== undefined ? { datesMade: r.datesMade } : {}),
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
  lastMade: string | null
  timesMade: number
}

/**
 * Normalizes a recipe list row for API response, applying null defaults.
 */
export function recipeListItemToJson(r: RecipeListRow) {
  return {
    id: r.id,
    userId: r.userId,
    title: r.title,
    category: r.category,
    tags: r.tags,
    isShared: r.isShared,
    totalTimeMinutes: r.totalTimeMinutes ?? null,
    createdAt: r.createdAt,
    lastMade: r.lastMade,
    timesMade: r.timesMade,
  }
}
