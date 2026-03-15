import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { isSunday } from './helpers'
import type { SavedPlanEntry } from '@/types'

// ── POST /api/plan — save confirmed plan ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { week_start: string; entries: { date: string; recipe_id: string }[] }
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

  // Find existing plan for this week, or create a new one
  const { data: existing } = await supabase
    .from('meal_plans')
    .select('id')
    .eq('user_id', user.id)
    .eq('week_start', week_start)
    .maybeSingle()

  let planId: string
  if (existing?.id) {
    planId = existing.id
  } else {
    const { data: created, error: createError } = await supabase
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

  // Keep shape consistent with previous code
  const plan = { id: planId }

  // Delete existing entries for this plan
  await supabase.from('meal_plan_entries').delete().eq('meal_plan_id', plan.id)

  // Insert new entries
  const newEntries = entries.map((e) => ({
    meal_plan_id: plan.id,
    recipe_id:    e.recipe_id,
    planned_date: e.date,
    position:     1,
    confirmed:    true,
  }))

  const { data: savedEntries, error: entryError } = await supabase
    .from('meal_plan_entries')
    .insert(newEntries)
    .select('id, meal_plan_id, recipe_id, planned_date, position, confirmed')

  if (entryError) {
    console.error('meal_plan_entries insert error:', entryError)
    return NextResponse.json({ error: 'Failed to save entries' }, { status: 500 })
  }

  return NextResponse.json({ plan_id: plan.id, entries: savedEntries as SavedPlanEntry[] })
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

  const { data: plan } = await supabase
    .from('meal_plans')
    .select('id, week_start')
    .eq('user_id', user.id)
    .eq('week_start', week_start)
    .single()

  if (!plan) {
    return NextResponse.json({ plan: null })
  }

  const { data: entries } = await supabase
    .from('meal_plan_entries')
    .select('planned_date, recipe_id, position, confirmed, recipes(title)')
    .eq('meal_plan_id', plan.id)
    .order('planned_date')

  const enrichedEntries = (entries ?? []).map((e: {
    planned_date: string
    recipe_id: string
    position: number
    confirmed: boolean
    recipes: unknown
  }) => ({
    planned_date:  e.planned_date,
    recipe_id:     e.recipe_id,
    recipe_title:  ((e.recipes as unknown) as { title: string } | null)?.title ?? '',
    position:      e.position,
    confirmed:     e.confirmed,
  }))

  return NextResponse.json({
    plan: {
      id:         plan.id,
      week_start: plan.week_start,
      entries:    enrichedEntries,
    },
  })
}
