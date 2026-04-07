import { z } from 'zod'
import { RECIPE_CATEGORIES, MEAL_TYPES, TAG_SECTIONS } from '@/types'

// ─── Shared primitives (derived from types/index.ts const arrays) ───────────

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date')

const recipeCategory = z.enum(RECIPE_CATEGORIES)

const mealType = z.enum(MEAL_TYPES)

const tagSection = z.enum(TAG_SECTIONS)

const positiveInt = z.number().int().positive()
const nonNegativeInt = z.number().int().nonnegative()

// ─── Recipes ────────────────────────────────────────────────────────────────

export const createRecipeSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  category: recipeCategory,
  tags: z.array(z.string()).default([]),
  ingredients: z.string().nullable().default(null),
  steps: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  image_url: z.string().nullable().default(null),
  prep_time_minutes: nonNegativeInt.nullable().default(null),
  cook_time_minutes: nonNegativeInt.nullable().default(null),
  total_time_minutes: nonNegativeInt.nullable().default(null),
  inactive_time_minutes: nonNegativeInt.nullable().default(null),
  servings: positiveInt.nullable().default(null),
  source: z.enum(['scraped', 'manual', 'generated']).default('manual'),
})

export const updateRecipeSchema = z.object({
  title: z.string().trim().min(1).optional(),
  category: recipeCategory.optional(),
  tags: z.array(z.string()).optional(),
  ingredients: z.string().nullable().optional(),
  steps: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  prep_time_minutes: nonNegativeInt.nullable().optional(),
  cook_time_minutes: nonNegativeInt.nullable().optional(),
  total_time_minutes: nonNegativeInt.nullable().optional(),
  inactive_time_minutes: nonNegativeInt.nullable().optional(),
  servings: positiveInt.nullable().optional(),
})

export const shareRecipeSchema = z.object({
  is_shared: z.boolean(),
})

export const logRecipeSchema = z.object({
  made_on: dateString.optional(),
  make_again: z.boolean().optional(),
})

export const patchLogSchema = z.object({
  make_again: z.boolean(),
})

export const deleteLogSchema = z.object({
  made_on: dateString,
})

export const searchRecipesSchema = z.object({
  query: z.string().optional(),
  filters: z.object({
    tags: z.array(z.string()),
    categories: z.array(recipeCategory),
    maxTotalMinutes: z.number().nullable(),
    lastMadeFrom: z.string().nullable(),
    lastMadeTo: z.string().nullable(),
    neverMade: z.boolean(),
  }).optional(),
})

export const scrapeRecipeSchema = z.object({
  url: z.string().trim().min(1, 'url is required').url('url must be a valid URL'),
})

export const generateRecipeSchema = z.object({
  specific_ingredients: z.string(),
  meal_type: mealType,
  style_hints: z.string(),
  dietary_restrictions: z.array(z.string()),
  tweak_request: z.string().optional(),
  previous_recipe: z.object({
    title: z.string(),
    ingredients: z.string(),
    steps: z.string(),
  }).optional(),
})

export const aiEditSchema = z.object({
  message: z.string().min(1),
  current_recipe: z.object({
    title:       z.string(),
    ingredients: z.string(),
    steps:       z.string(),
    notes:       z.string().optional().nullable(),
    servings:    z.number().optional().nullable(),
  }),
  conversation_history: z.array(
    z.object({
      role:    z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ),
})

export const bulkUpdateRecipesSchema = z.object({
  recipe_ids: z.array(z.string()).min(1, 'recipe_ids is required and must be non-empty'),
  add_tags: z.array(z.string()).default([]),
})

// ─── Plan ───────────────────────────────────────────────────────────────────

export const createPlanSchema = z.object({
  week_start: dateString,
  entries: z.array(z.object({
    date: dateString,
    recipe_id: z.string(),
    meal_type: mealType.optional(),
    is_side_dish: z.boolean().optional(),
    parent_entry_id: z.string().optional(),
  })).min(1),
})

export const createPlanEntrySchema = z.object({
  week_start: dateString,
  date: dateString,
  recipe_id: z.string(),
  meal_type: mealType,
  is_side_dish: z.boolean().default(false),
  parent_entry_id: z.string().optional(),
})

export const suggestSchema = z.object({
  week_start: dateString,
  active_dates: z.array(dateString).min(1),
  active_meal_types: z.array(mealType).default(['dinner']),
  prefer_this_week: z.array(z.string()).default([]),
  avoid_this_week: z.array(z.string()).default([]),
  free_text: z.string().default(''),
  include_next_week_plan: z.boolean().default(true),
})

export const swapSchema = z.object({
  date: dateString,
  meal_type: mealType.default('dinner'),
  week_start: dateString,
  already_selected: z.array(z.object({
    date: dateString,
    recipe_id: z.string(),
  })).default([]),
  prefer_this_week: z.array(z.string()).default([]),
  avoid_this_week: z.array(z.string()).default([]),
  free_text: z.string().default(''),
})

export const matchSchema = z.object({
  query: z.string().min(1),
  date: dateString.optional(),
})

export const swapEntriesSchema = z.object({
  entry_id_a: z.string().uuid(),
  entry_id_b: z.string().uuid(),
})

// ─── Preferences ────────────────────────────────────────────────────────────

export const updatePreferencesSchema = z.object({
  options_per_day: z.number().int().min(1).max(5).optional(),
  cooldown_days: z.number().int().min(1).max(60).optional(),
  seasonal_mode: z.boolean().optional(),
  preferred_tags: z.array(z.string()).optional(),
  avoided_tags: z.array(z.string()).optional(),
  limited_tags: z.array(z.object({
    tag: z.string(),
    cap: z.number().int().min(1).max(7),
  })).optional(),
  onboarding_completed: z.boolean().optional(),
  meal_context: z.string().max(2000).nullable().optional(),
  hidden_tags: z.array(z.string()).optional(),
  week_start_day: z.number().int().min(0).max(6).optional(),
})

// ─── Groceries ──────────────────────────────────────────────────────────────

export const updateGroceryListSchema = z.object({
  week_start: dateString.optional(),
  list_id: z.string().optional(),
  items: z.array(z.unknown()).optional(),
  servings: z.number().optional(),
  recipe_scales: z.array(z.unknown()).optional(),
})

export const generateGroceriesSchema = z.object({
  week_start: dateString.optional(),
  date_from: dateString.optional(),
  date_to: dateString.optional(),
})

// ─── Tags ───────────────────────────────────────────────────────────────────

export const createTagSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  section: tagSection.default('cuisine'),
})

// ─── Household ──────────────────────────────────────────────────────────────

export const createHouseholdSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
})

export const updateMemberRoleSchema = z.object({
  role: z.enum(['co_owner', 'member']),
})

export const joinHouseholdSchema = z.object({
  token: z.string().trim().min(1, 'token is required'),
})

export const transferOwnershipSchema = z.object({
  new_owner_id: z.string().min(1),
})

// ─── Import ─────────────────────────────────────────────────────────────────

export const parsedRecipeSchema = z.object({
  title:                 z.string().min(1),
  category:              z.enum(RECIPE_CATEGORIES).nullable(),
  ingredients:           z.string().nullable(),
  steps:                 z.string().nullable(),
  notes:                 z.string().nullable(),
  url:                   z.string().nullable(),
  image_url:             z.string().nullable(),
  prep_time_minutes:     z.number().int().nonnegative().nullable(),
  cook_time_minutes:     z.number().int().nonnegative().nullable(),
  total_time_minutes:    z.number().int().nonnegative().nullable(),
  inactive_time_minutes: z.number().int().nonnegative().nullable(),
  servings:              z.number().int().positive().nullable(),
  tags:                  z.array(z.string()).default([]),
  source:                z.enum(['scraped', 'manual']),
})

export const importUrlsSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(200),
})

export const confirmNotionMappingSchema = z.object({
  file_content: z.string().min(1),
  mapping:      z.record(z.string(), z.string()),
})

export const importSaveSchema = z.object({
  recipes: z.array(z.object({
    data:             parsedRecipeSchema,
    duplicate_action: z.enum(['skip', 'keep_both', 'replace']).optional(),
    existing_id:      z.string().uuid().optional(),
  })).min(1).max(200),
}).refine(
  (val) => val.recipes.every(
    (r) => r.duplicate_action !== 'replace' || r.existing_id !== undefined,
  ),
  { message: 'existing_id is required when duplicate_action is replace' },
)

// ─── Invite ─────────────────────────────────────────────────────────────────

export const consumeInviteSchema = z.object({
  token: z.string().min(1),
})

// ─── Helpers ────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'

/**
 * Parse and validate a request body against a Zod schema.
 * Returns { data, error } — if error is set, return it as the response.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
): Promise<{ data: z.infer<T>; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { error: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const first = result.error.issues[0]
    const message = first ? `${first.path.join('.')}: ${first.message}`.replace(/^: /, '') : 'Validation error'
    return { error: NextResponse.json({ error: message }, { status: 400 }) }
  }
  return { data: result.data }
}
