import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { isSunday } from './helpers'
import type { SavedPlanEntry } from '@/types'

// ── POST /api/plan — save confirmed plan ───────────────────────────────────────

export async function POST(req: NextRequest) {
  // Step 1: verify identity with user-scoped client
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { week_start: string; entries: { date: string; recipe_id: string; meal_type?: string; is_side_dish?: boolean; parent_entry_id?: string }[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { week_start, entries } = body

  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: 'entries must be non-empty' }, { status: 400 })
  }
  if (!isSunday(week_start)) {
    return NextResponse.json({ error: 'week_start must be a Sunday' }, { status: 400 })
  }

  // Step 2: all DB operations use the admin client (bypasses RLS, scoped by user.id)
  const db = createAdminClient()

  // Find existing plan for this week, or create a new one
  const { data: existing } = await db
    .from('meal_plans')
    .select('id')
    .eq('user_id', user.id)
    .eq('week_start', week_start)
    .maybeSingle()

  let planId: string
  if (existing?.id) {
    planId = existing.id
  } else {
    const { data: created, error: createError } = await db
      .from('meal_plans')
      .insert({ user_id: user.id, week_start })
      .select('id')
      .single()

    if (createError || !created) {
      console.error('meal_plans insert error:', createError)
      return NextResponse.json({ error: `Failed to create plan: ${createError?.message ?? 'unknown'}` }, { status: 500 })
    }
    planId = created.id
  }

  // Delete existing entries for this plan, then insert fresh ones
  await db.from('meal_plan_entries').delete().eq('meal_plan_id', planId)

  const newEntries = entries.map((e) => ({
    meal_plan_id:    planId,
    recipe_id:       e.recipe_id,
    planned_date:    e.date,
    position:        1,
    confirmed:       true,
    meal_type:       e.meal_type ?? 'dinner',
    is_side_dish:    e.is_side_dish ?? false,
    parent_entry_id:    e.parent_entry_id ?? null,
    total_time_minutes: ((e.recipes as unknown) as { total_time_minutes: number | null } | null)?.total_time_minutes ?? null,
  }))

  const { data: savedEntries, error: entryError } = await db
    .from('meal_plan_entries')
    .insert(newEntries)
    .select('id, meal_plan_id, recipe_id, planned_date, position, confirmed, meal_type, is_side_dish, parent_entry_id')

  if (entryError) {
    console.error('meal_plan_entries insert error:', entryError)
    return NextResponse.json({ error: `Failed to save entries: ${entryError.message}` }, { status: 500 })
  }

  return NextResponse.json({ plan_id: planId, entries: savedEntries as SavedPlanEntry[] })
}

// ── GET /api/plan?week_start=YYYY-MM-DD — fetch existing plan ──────────────────

export async function GET(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const week_start = searchParams.get('week_start')

  if (!week_start) {
    return NextResponse.json({ error: 'week_start is required' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data: plan } = await db
    .from('meal_plans')
    .select('id, week_start')
    .eq('user_id', user.id)
    .eq('week_start', week_start)
    .single()

  if (!plan) {
    return NextResponse.json({ plan: null })
  }

  const { data: entries } = await db
    .from('meal_plan_entries')
    .select('id, planned_date, recipe_id, position, confirmed, meal_type, is_side_dish, parent_entry_id, recipes(title, total_time_minutes)')
    .eq('meal_plan_id', plan.id)
    .order('planned_date')

  const enrichedEntries = (entries ?? []).map((e: {
    id: string
    planned_date: string
    recipe_id: string
    position: number
    confirmed: boolean
    meal_type: string
    is_side_dish: boolean
    parent_entry_id: string | null
    recipes: unknown
  }) => ({
    id:              e.id,
    planned_date:    e.planned_date,
    recipe_id:       e.recipe_id,
    recipe_title:    ((e.recipes as unknown) as { title: string } | null)?.title ?? '',
    position:        e.position,
    confirmed:       e.confirmed,
    meal_type:       e.meal_type ?? 'dinner',
    is_side_dish:    e.is_side_dish ?? false,
    parent_entry_id:    e.parent_entry_id ?? null,
    total_time_minutes: ((e.recipes as unknown) as { total_time_minutes: number | null } | null)?.total_time_minutes ?? null,
  }))

  return NextResponse.json({
    plan: {
      id:         plan.id,
      week_start: plan.week_start,
      entries:    enrichedEntries,
    },
  })
}
