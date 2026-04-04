import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { createPlanSchema, parseBody } from '@/lib/schemas'
import { getOrCreateMealPlan } from './helpers'
import { scopeQuery } from '@/lib/household'
import type { SavedPlanEntry } from '@/types'

// ── POST /api/plan — save confirmed plan ───────────────────────────────────────

export const POST = withAuth(async (req, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, createPlanSchema)
  if (parseError) return parseError

  const { week_start, entries } = body

  const planResult = await getOrCreateMealPlan(db, user.id, week_start, ctx)
  if ('error' in planResult) {
    console.error('meal_plans insert error:', planResult.error)
    return NextResponse.json({ error: `Failed to create plan: ${planResult.error}` }, { status: 500 })
  }
  const { planId } = planResult

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
    parent_entry_id: e.parent_entry_id ?? null,
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
})

// ── GET /api/plan?week_start=YYYY-MM-DD — fetch existing plan ──────────────────

export const GET = withAuth(async (req, { user, db, ctx }) => {
  const { searchParams } = new URL(req.url)
  const week_start = searchParams.get('week_start')

  if (!week_start) {
    return NextResponse.json({ error: 'week_start is required' }, { status: 400 })
  }

  const { data: plan } = await scopeQuery(db
    .from('meal_plans')
    .select('id, week_start')
    .eq('week_start', week_start), user.id, ctx).single()

  if (!plan) {
    return NextResponse.json({ plan: null })
  }

  const { data: entries } = await db
    .from('meal_plan_entries')
    .select('id, planned_date, recipe_id, position, confirmed, meal_type, is_side_dish, parent_entry_id, recipes(title, total_time_minutes)')
    .eq('meal_plan_id', plan.id)
    .order('planned_date')

  const enrichedEntries = (entries ?? []).map((e) => ({
    id:              e.id,
    planned_date:    e.planned_date,
    recipe_id:       e.recipe_id,
    recipe_title:    e.recipes?.title ?? '',
    position:        e.position,
    confirmed:       e.confirmed,
    meal_type:       e.meal_type,
    is_side_dish:    e.is_side_dish,
    parent_entry_id:    e.parent_entry_id,
    total_time_minutes: e.recipes?.total_time_minutes ?? null,
  }))

  return NextResponse.json({
    plan: {
      id:         plan.id,
      week_start: plan.week_start,
      entries:    enrichedEntries,
    },
  })
})
