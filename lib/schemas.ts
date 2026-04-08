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
  imageUrl: z.string().nullable().default(null),
  prepTimeMinutes: nonNegativeInt.nullable().default(null),
  cookTimeMinutes: nonNegativeInt.nullable().default(null),
  totalTimeMinutes: nonNegativeInt.nullable().default(null),
  inactiveTimeMinutes: nonNegativeInt.nullable().default(null),
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
  imageUrl: z.string().nullable().optional(),
  prepTimeMinutes: nonNegativeInt.nullable().optional(),
  cookTimeMinutes: nonNegativeInt.nullable().optional(),
  totalTimeMinutes: nonNegativeInt.nullable().optional(),
  inactiveTimeMinutes: nonNegativeInt.nullable().optional(),
  servings: positiveInt.nullable().optional(),
})

export const shareRecipeSchema = z.object({
  isShared: z.boolean(),
})

export const logRecipeSchema = z.object({
  madeOn: dateString.optional(),
  makeAgain: z.boolean().optional(),
})

export const patchLogSchema = z.object({
  makeAgain: z.boolean(),
})

export const deleteLogSchema = z.object({
  madeOn: dateString,
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
  specificIngredients: z.string(),
  mealType: mealType,
  styleHints: z.string(),
  dietaryRestrictions: z.array(z.string()),
  tweakRequest: z.string().optional(),
  previousRecipe: z.object({
    title: z.string(),
    ingredients: z.string(),
    steps: z.string(),
  }).optional(),
})

export const aiEditSchema = z.object({
  message: z.string().min(1),
  currentRecipe: z.object({
    title:       z.string(),
    ingredients: z.string(),
    steps:       z.string(),
    notes:       z.string().optional().nullable(),
    servings:    z.number().optional().nullable(),
  }),
  conversationHistory: z.array(
    z.object({
      role:    z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ),
})

export const generateRefineSchema = z.object({
  message: z.string().trim().min(1, 'message is required'),
  currentRecipe: z.object({
    title:                 z.string().min(1, 'currentRecipe.title is required'),
    ingredients:           z.string(),
    steps:                 z.string(),
    tags:                  z.array(z.string()).default([]),
    category:              z.string(),
    servings:              z.number().nullable().optional(),
    prepTimeMinutes:     z.number().nullable().optional(),
    cookTimeMinutes:     z.number().nullable().optional(),
    totalTimeMinutes:    z.number().nullable().optional(),
    inactiveTimeMinutes: z.number().nullable().optional(),
    notes:                 z.string().nullable().optional(),
  }),
  conversationHistory: z.array(
    z.object({
      role:    z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ).default([]),
  generationContext: z.object({
    mealType:            z.string(),
    styleHints:          z.string(),
    dietaryRestrictions: z.array(z.string()),
  }),
})

export const bulkUpdateRecipesSchema = z.object({
  recipeIds: z.array(z.string()).min(1, 'recipeIds is required and must be non-empty'),
  addTags: z.array(z.string()).default([]),
})

// ─── Plan ───────────────────────────────────────────────────────────────────

export const createPlanSchema = z.object({
  weekStart: dateString,
  entries: z.array(z.object({
    date: dateString,
    recipeId: z.string(),
    mealType: mealType.optional(),
    isSideDish: z.boolean().optional(),
    parentEntryId: z.string().optional(),
  })).min(1),
})

export const createPlanEntrySchema = z.object({
  weekStart: dateString,
  date: dateString,
  recipeId: z.string(),
  mealType: mealType,
  isSideDish: z.boolean().default(false),
  parentEntryId: z.string().optional(),
})

export const suggestSchema = z.object({
  weekStart: dateString,
  activeDates: z.array(dateString).min(1),
  activeMealTypes: z.array(mealType).default(['dinner']),
  preferThisWeek: z.array(z.string()).default([]),
  avoidThisWeek: z.array(z.string()).default([]),
  freeText: z.string().default(''),
  includeNextWeekPlan: z.boolean().default(true),
})

export const swapSchema = z.object({
  date: dateString,
  mealType: mealType.default('dinner'),
  weekStart: dateString,
  alreadySelected: z.array(z.object({
    date: dateString,
    recipeId: z.string(),
  })).default([]),
  preferThisWeek: z.array(z.string()).default([]),
  avoidThisWeek: z.array(z.string()).default([]),
  freeText: z.string().default(''),
})

export const matchSchema = z.object({
  query: z.string().min(1),
  date: dateString.optional(),
})

export const swapEntriesSchema = z.object({
  entryIdA: z.string().uuid(),
  entryIdB: z.string().uuid(),
})

// ─── Preferences ────────────────────────────────────────────────────────────

export const updatePreferencesSchema = z.object({
  optionsPerDay: z.number().int().min(1).max(5).optional(),
  cooldownDays: z.number().int().min(1).max(60).optional(),
  seasonalMode: z.boolean().optional(),
  preferredTags: z.array(z.string()).optional(),
  avoidedTags: z.array(z.string()).optional(),
  limitedTags: z.array(z.object({
    tag: z.string(),
    cap: z.number().int().min(1).max(7),
  })).optional(),
  onboardingCompleted: z.boolean().optional(),
  mealContext: z.string().max(2000).nullable().optional(),
  hiddenTags: z.array(z.string()).optional(),
  weekStartDay: z.number().int().min(0).max(6).optional(),
})

// ─── Groceries ──────────────────────────────────────────────────────────────

export const updateGroceryListSchema = z.object({
  weekStart: dateString.optional(),
  listId: z.string().optional(),
  items: z.array(z.unknown()).optional(),
  servings: z.number().optional(),
  recipeScales: z.array(z.unknown()).optional(),
})

export const generateGroceriesSchema = z.object({
  weekStart: dateString.optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
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
  newOwnerId: z.string().min(1),
})

// ─── Import ─────────────────────────────────────────────────────────────────

export const parsedRecipeSchema = z.object({
  title:                 z.string().min(1),
  category:              z.enum(RECIPE_CATEGORIES).nullable(),
  ingredients:           z.string().nullable(),
  steps:                 z.string().nullable(),
  notes:                 z.string().nullable(),
  url:                   z.string().nullable(),
  imageUrl:             z.string().nullable(),
  prepTimeMinutes:     z.number().int().nonnegative().nullable(),
  cookTimeMinutes:     z.number().int().nonnegative().nullable(),
  totalTimeMinutes:    z.number().int().nonnegative().nullable(),
  inactiveTimeMinutes: z.number().int().nonnegative().nullable(),
  servings:              z.number().int().positive().nullable(),
  tags:                  z.array(z.string()).default([]),
  source:                z.enum(['scraped', 'manual']),
})

export const importUrlsSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(200),
})

export const confirmNotionMappingSchema = z.object({
  fileContent: z.string().min(1),
  mapping:      z.record(z.string(), z.string()),
})

export const importSaveSchema = z.object({
  recipes: z.array(z.object({
    data:             parsedRecipeSchema,
    duplicateAction: z.enum(['skip', 'keep_both', 'replace']).optional(),
    existingId:      z.string().uuid().optional(),
  })).min(1).max(200),
}).refine(
  (val) => val.recipes.every(
    (r) => r.duplicateAction !== 'replace' || r.existingId !== undefined,
  ),
  { message: 'existingId is required when duplicateAction is replace' },
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
