export const STYLE_TAGS = [
  'Comfort', 'Entertain', 'Favorite', 'Grill', 'One Pot',
  'Quick', 'Sheet Pan', 'Slow Cooker', 'Sourdough', 'Soup', 'Spicy',
] as const

export const DIETARY_TAGS = [
  'Dairy-Free', 'Egg-Free', 'Gluten-Free', 'High-Protein', 'Keto',
  'Low-Carb', 'Nut-Free', 'Paleo', 'Pescatarian', 'Vegan',
  'Vegetarian', 'Whole30',
] as const

export const SEASONAL_TAGS = ['Autumn', 'Spring', 'Summer', 'Winter'] as const

export const CUISINE_TAGS = [
  'American', 'Asian', 'Chinese', 'French', 'Greek', 'Hungarian',
  'Indian', 'Irish', 'Italian', 'Japanese', 'Mediterranean',
  'Mexican', 'Middle Eastern', 'Thai',
] as const

export const PROTEIN_TAGS = [
  'Bacon', 'Beans', 'Beef', 'Chicken', 'Chickpeas', 'Eggs', 'Fish',
  'Lamb', 'Lentils', 'Pork', 'Salmon', 'Sausage', 'Seitan',
  'Shrimp', 'Tempeh', 'Tofu', 'Turkey',
] as const

export const FIRST_CLASS_TAGS: string[] = [
  ...STYLE_TAGS, ...DIETARY_TAGS, ...SEASONAL_TAGS,
  ...CUISINE_TAGS, ...PROTEIN_TAGS,
]

// ── Tag validation ────────────────────────────────────────────────────────────

import { type SupabaseClient } from '@supabase/supabase-js'
import type { HouseholdContext } from '@/types'
import { scopeQuery } from './household'

/**
 * Validates tags against the first-class list + the user's custom tags.
 * Returns `{ valid: true }` or `{ valid: false, unknownTags }`.
 */
export async function validateTags(
  db: SupabaseClient,
  tags: string[],
  userId: string,
  ctx: HouseholdContext | null,
): Promise<{ valid: true } | { valid: false; unknownTags: string[] }> {
  if (tags.length === 0) return { valid: true }

  const customTagsQuery = scopeQuery(
    db.from('custom_tags').select('name'),
    userId,
    ctx,
  )
  const { data: customTags } = await customTagsQuery

  const knownNames = new Set([
    ...FIRST_CLASS_TAGS.map((t) => t.toLowerCase()),
    ...(customTags ?? []).map((t: { name: string }) => t.name.toLowerCase()),
  ])

  const unknownTags = tags.filter((t) => !knownNames.has(t.toLowerCase()))
  if (unknownTags.length > 0) {
    return { valid: false, unknownTags }
  }
  return { valid: true }
}
