import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { GroceryItem, RecipeScale } from '@/types'
import { db } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { groceryLists, mealPlans } from '@/lib/db/schema'
import { scopeCondition } from '@/lib/household'
import { dbFirst, dbSingle } from '@/lib/db/helpers'
import { updateGroceryListSchema, parseBody } from '@/lib/schemas'
import { logger } from '@/lib/logger'

// ── Backward-compat normalizer ────────────────────────────────────────────────
// Lists generated before the camelCase refactor (#351) stored JSONB with
// snake_case keys (recipe_id, recipe_title, is_pantry). Normalize on read so
// the UI always receives camelCase regardless of when the list was generated.

function normalizeRecipeScales(raw: unknown): RecipeScale[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s: unknown) => {
    if (typeof s !== 'object' || s === null) return s as RecipeScale
    const r = s as Record<string, unknown>
    return {
      recipeId:    (r.recipeId   ?? r.recipe_id)    as string,
      recipeTitle: (r.recipeTitle ?? r.recipe_title) as string,
      servings:    r.servings as number | null,
    }
  })
}

function normalizeItems(raw: unknown): GroceryItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) return item as GroceryItem
    const i = item as Record<string, unknown>
    // Normalize is_pantry → isPantry (old snake_case JSONB)
    if ('is_pantry' in i && !('isPantry' in i)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { is_pantry, ...rest } = i
      return { ...rest, isPantry: is_pantry } as unknown as GroceryItem
    }
    return item as GroceryItem
  })
}

// ── GET /api/groceries?weekStart=YYYY-MM-DD  (or ?dateFrom=YYYY-MM-DD) ─────

export const GET = withAuth(async (req, { user, ctx }) => {
  const url = new URL(req.url)
  // Accept dateFrom as alias for weekStart (generate stores weekStart = dateFrom)
  const weekStart = url.searchParams.get('weekStart') ?? url.searchParams.get('dateFrom')
  if (!weekStart) {
    return NextResponse.json({ error: 'weekStart or dateFrom is required' }, { status: 400 })
  }

  logger.debug({ weekStart, userId: user.id }, 'fetching grocery list')
  const rows = await db
    .select()
    .from(groceryLists)
    .where(and(
      eq(groceryLists.weekStart, weekStart),
      scopeCondition({ userId: groceryLists.userId, householdId: groceryLists.householdId }, user.id, ctx),
    ))
    .limit(1)

  const list = dbFirst(rows)

  if (list) {
    const normalized = {
      ...list,
      recipeScales: normalizeRecipeScales(list.recipeScales),
      items:        normalizeItems(list.items),
    }
    logger.debug({ weekStart, found: true }, 'grocery list fetched')
    return NextResponse.json({ list: normalized })
  }

  logger.debug({ weekStart, found: false }, 'grocery list fetched')
  return NextResponse.json({ list: null })
})

// ── PATCH /api/groceries ──────────────────────────────────────────────────────

export const PATCH = withAuth(async (req, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, updateGroceryListSchema)
  if (parseError) return parseError

  const { weekStart, listId, items, servings, recipeScales } = body as {
    weekStart?:    string
    listId?:       string
    items?:         GroceryItem[]
    servings?:      number
    recipeScales?: RecipeScale[]
  }
  if (!weekStart && !listId) {
    return NextResponse.json({ error: 'weekStart or listId is required' }, { status: 400 })
  }

  // Find existing row — prefer listId for direct lookup, fall back to weekStart
  let existing: { id: string; mealPlanId: string | null } | null = null
  if (listId) {
    try {
      const rows = await db
        .select({ id: groceryLists.id, mealPlanId: groceryLists.mealPlanId })
        .from(groceryLists)
        .where(and(
          eq(groceryLists.id, listId),
          scopeCondition({ userId: groceryLists.userId, householdId: groceryLists.householdId }, user.id, ctx),
        ))
        .limit(1)
      existing = dbSingle(rows)
    } catch {
      return NextResponse.json({ error: 'Grocery list not found' }, { status: 404 })
    }
  } else {
    try {
      const rows = await db
        .select({ id: groceryLists.id, mealPlanId: groceryLists.mealPlanId })
        .from(groceryLists)
        .where(and(
          eq(groceryLists.weekStart, weekStart!),
          scopeCondition({ userId: groceryLists.userId, householdId: groceryLists.householdId }, user.id, ctx),
        ))
        .limit(1)
      existing = dbSingle(rows)
    } catch {
      return NextResponse.json({ error: 'Grocery list not found' }, { status: 404 })
    }
  }

  // Build update payload
  const update: Record<string, unknown> = { updatedAt: new Date() }
  if (items !== undefined) update.items = items
  if (servings !== undefined) update.servings = servings
  if (recipeScales !== undefined) update.recipeScales = recipeScales

  try {
    const [updated] = await db
      .update(groceryLists)
      .set(update)
      .where(eq(groceryLists.id, existing.id))
      .returning()

    if (!updated) {
      logger.error({ listId: existing.id }, 'failed to update grocery list')
      return NextResponse.json({ error: 'Failed to update grocery list' }, { status: 500 })
    }

    // If servings changed, also update meal_plans
    if (servings !== undefined && existing.mealPlanId) {
      await db
        .update(mealPlans)
        .set({ servings })
        .where(eq(mealPlans.id, existing.mealPlanId))
    }

    return NextResponse.json(updated)
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err), listId: existing.id }, 'failed to update grocery list')
    return NextResponse.json({ error: 'Failed to update grocery list' }, { status: 500 })
  }
})
