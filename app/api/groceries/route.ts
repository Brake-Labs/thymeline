import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { GroceryItem, GroceryList, RecipeScale } from '@/types'

// ── GET /api/groceries?week_start=YYYY-MM-DD ─────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const weekStart = new URL(req.url).searchParams.get('week_start')
  if (!weekStart) {
    return NextResponse.json({ error: 'week_start is required' }, { status: 400 })
  }

  const { data: list, error } = await supabase
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
    week_start:     string
    items?:         GroceryItem[]
    people_count?:  number
    recipe_scales?: RecipeScale[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { week_start, items, people_count, recipe_scales } = body
  if (!week_start) {
    return NextResponse.json({ error: 'week_start is required' }, { status: 400 })
  }

  // Find existing row
  const { data: existing, error: fetchError } = await supabase
    .from('grocery_lists')
    .select('id, meal_plan_id')
    .eq('user_id', user.id)
    .eq('week_start', week_start)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Grocery list not found' }, { status: 404 })
  }

  // Build update payload
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (items !== undefined) update.items = items
  if (people_count !== undefined) update.people_count = people_count
  if (recipe_scales !== undefined) update.recipe_scales = recipe_scales

  const { data: updated, error: updateError } = await supabase
    .from('grocery_lists')
    .update(update)
    .eq('id', existing.id)
    .select('*')
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: 'Failed to update grocery list' }, { status: 500 })
  }

  // If people_count changed, also update meal_plans
  if (people_count !== undefined) {
    await supabase
      .from('meal_plans')
      .update({ people_count })
      .eq('id', existing.meal_plan_id)
  }

  return NextResponse.json(updated as GroceryList)
}
