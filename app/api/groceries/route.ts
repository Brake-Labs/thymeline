import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { GroceryItem, RecipeScale } from '@/types'
import { scopeQuery } from '@/lib/household'
import { updateGroceryListSchema, parseBody } from '@/lib/schemas'
import { logger } from '@/lib/logger'

// ── GET /api/groceries?week_start=YYYY-MM-DD  (or ?date_from=YYYY-MM-DD) ─────

export const GET = withAuth(async (req, { user, db, ctx }) => {
  const url = new URL(req.url)
  // Accept date_from as alias for week_start (generate stores week_start = date_from)
  const weekStart = url.searchParams.get('week_start') ?? url.searchParams.get('date_from')
  if (!weekStart) {
    return NextResponse.json({ error: 'week_start or date_from is required' }, { status: 400 })
  }

  logger.debug({ weekStart, userId: user.id }, 'fetching grocery list')
  const listQ = scopeQuery(db.from('grocery_lists').select('*').eq('week_start', weekStart), user.id, ctx)
  const { data: list, error } = await listQ.single()

  if (error && error.code !== 'PGRST116') {
    logger.error({ error, weekStart }, 'failed to fetch grocery list')
    return NextResponse.json({ error: 'Failed to fetch grocery list' }, { status: 500 })
  }

  logger.debug({ weekStart, found: !!list }, 'grocery list fetched')
  return NextResponse.json({ list: list ?? null })
})

// ── PATCH /api/groceries ──────────────────────────────────────────────────────

export const PATCH = withAuth(async (req, { user, db, ctx }) => {
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
  let existing: { id: string; meal_plan_id: string } | null = null
  if (list_id) {
    const q = scopeQuery(db.from('grocery_lists').select('id, meal_plan_id').eq('id', list_id), user.id, ctx)
    const { data, error } = await q.single()
    if (error || !data) {
      return NextResponse.json({ error: 'Grocery list not found' }, { status: 404 })
    }
    existing = data as { id: string; meal_plan_id: string }
  } else {
    const q = scopeQuery(db.from('grocery_lists').select('id, meal_plan_id').eq('week_start', week_start!), user.id, ctx)
    const { data, error } = await q.single()
    if (error || !data) {
      return NextResponse.json({ error: 'Grocery list not found' }, { status: 404 })
    }
    existing = data as { id: string; meal_plan_id: string }
  }

  // Build update payload
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (items !== undefined) update.items = items
  if (servings !== undefined) update.servings = servings
  if (recipe_scales !== undefined) update.recipe_scales = recipe_scales

  const { data: updated, error: updateError } = await db
    .from('grocery_lists')
    .update(update)
    .eq('id', existing.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    logger.error({ error: updateError, listId: existing.id }, 'failed to update grocery list')
    return NextResponse.json({ error: 'Failed to update grocery list' }, { status: 500 })
  }

  // If servings changed, also update meal_plans
  if (servings !== undefined) {
    await db
      .from('meal_plans')
      .update({ servings })
      .eq('id', existing.meal_plan_id)
  }

  return NextResponse.json({
    ...updated,
    items: updated.items as unknown as GroceryItem[],
    recipe_scales: updated.recipe_scales as unknown as RecipeScale[],
  })
})
