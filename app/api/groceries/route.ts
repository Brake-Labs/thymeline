import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { GroceryItem, GroceryList, RecipeScale } from '@/types'

// ── GET /api/groceries?week_start=YYYY-MM-DD  (or ?date_from=YYYY-MM-DD) ─────

export async function GET(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  // Accept date_from as alias for week_start (generate stores week_start = date_from)
  const weekStart = url.searchParams.get('week_start') ?? url.searchParams.get('date_from')
  if (!weekStart) {
    return NextResponse.json({ error: 'week_start or date_from is required' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: list, error } = await db
    .from('grocery_lists')
    .select('*')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Failed to fetch grocery list' }, { status: 500 })
  }

  return NextResponse.json({ list: list ?? null })
}

// ── PATCH /api/groceries ──────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    week_start?:    string
    list_id?:       string
    items?:         GroceryItem[]
    servings?:      number
    recipe_scales?: RecipeScale[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { week_start, list_id, items, servings, recipe_scales } = body
  if (!week_start && !list_id) {
    return NextResponse.json({ error: 'week_start or list_id is required' }, { status: 400 })
  }

  const db = createAdminClient()

  // Find existing row — prefer list_id for direct lookup, fall back to week_start
  let existing: { id: string; meal_plan_id: string } | null = null
  if (list_id) {
    const { data, error } = await db
      .from('grocery_lists')
      .select('id, meal_plan_id')
      .eq('id', list_id)
      .eq('user_id', user.id)
      .single()
    if (error || !data) {
      return NextResponse.json({ error: 'Grocery list not found' }, { status: 404 })
    }
    existing = data as { id: string; meal_plan_id: string }
  } else {
    const { data, error } = await db
      .from('grocery_lists')
      .select('id, meal_plan_id')
      .eq('user_id', user.id)
      .eq('week_start', week_start!)
      .single()
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
    return NextResponse.json({ error: 'Failed to update grocery list' }, { status: 500 })
  }

  // If servings changed, also update meal_plans
  if (servings !== undefined) {
    await db
      .from('meal_plans')
      .update({ servings })
      .eq('id', existing.meal_plan_id)
  }

  return NextResponse.json(updated as GroceryList)
}
