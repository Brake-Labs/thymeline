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

  logger.debug({ weekStart, found: !!list }, 'grocery list fetched')
  return NextResponse.json({ list: list ?? null })
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
