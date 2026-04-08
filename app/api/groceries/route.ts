import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { GroceryItem, GroceryList, RecipeScale } from '@/types'
import { db } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { groceryLists, mealPlans } from '@/lib/db/schema'
import { scopeCondition } from '@/lib/household'
import { dbFirst, dbSingle } from '@/lib/db/helpers'
import { updateGroceryListSchema, parseBody } from '@/lib/schemas'

function toGroceryList(row: {
  id: string
  userId: string
  mealPlanId: string | null
  weekStart: string
  dateFrom: string | null
  dateTo: string | null
  servings: number
  recipeScales: unknown
  items: unknown
  createdAt: Date
  updatedAt: Date
}): GroceryList {
  return {
    id:            row.id,
    user_id:       row.userId,
    meal_plan_id:  row.mealPlanId ?? '',
    week_start:    row.weekStart,
    date_from:     row.dateFrom,
    date_to:       row.dateTo,
    servings:      row.servings,
    recipe_scales: row.recipeScales as RecipeScale[],
    items:         row.items as GroceryItem[],
    created_at:    row.createdAt.toISOString(),
    updated_at:    row.updatedAt.toISOString(),
  }
}

// ── GET /api/groceries?week_start=YYYY-MM-DD  (or ?date_from=YYYY-MM-DD) ─────

export const GET = withAuth(async (req, { user, ctx }) => {
  const url = new URL(req.url)
  // Accept date_from as alias for week_start (generate stores week_start = date_from)
  const weekStart = url.searchParams.get('week_start') ?? url.searchParams.get('date_from')
  if (!weekStart) {
    return NextResponse.json({ error: 'week_start or date_from is required' }, { status: 400 })
  }

  const rows = await db
    .select()
    .from(groceryLists)
    .where(and(
      eq(groceryLists.weekStart, weekStart),
      scopeCondition({ userId: groceryLists.userId, householdId: groceryLists.householdId }, user.id, ctx),
    ))
    .limit(1)

  const list = dbFirst(rows)

  return NextResponse.json({ list: list ? toGroceryList(list) : null })
})

// ── PATCH /api/groceries ──────────────────────────────────────────────────────

export const PATCH = withAuth(async (req, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, updateGroceryListSchema)
  if (parseError) return parseError

  const { week_start, list_id, items, servings, recipe_scales } = body as {
    week_start?:    string
    list_id?:       string
    items?:         GroceryItem[]
    servings?:      number
    recipe_scales?: RecipeScale[]
  }
  if (!week_start && !list_id) {
    return NextResponse.json({ error: 'week_start or list_id is required' }, { status: 400 })
  }

  // Find existing row — prefer list_id for direct lookup, fall back to week_start
  let existing: { id: string; mealPlanId: string | null } | null = null
  if (list_id) {
    try {
      const rows = await db
        .select({ id: groceryLists.id, mealPlanId: groceryLists.mealPlanId })
        .from(groceryLists)
        .where(and(
          eq(groceryLists.id, list_id),
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
          eq(groceryLists.weekStart, week_start!),
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
  if (recipe_scales !== undefined) update.recipeScales = recipe_scales

  try {
    const [updated] = await db
      .update(groceryLists)
      .set(update)
      .where(eq(groceryLists.id, existing.id))
      .returning()

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update grocery list' }, { status: 500 })
    }

    // If servings changed, also update meal_plans
    if (servings !== undefined && existing.mealPlanId) {
      await db
        .update(mealPlans)
        .set({ servings })
        .where(eq(mealPlans.id, existing.mealPlanId))
    }

    return NextResponse.json(toGroceryList(updated))
  } catch (err) {
    console.error('Grocery list update error:', err)
    return NextResponse.json({ error: 'Failed to update grocery list' }, { status: 500 })
  }
})
