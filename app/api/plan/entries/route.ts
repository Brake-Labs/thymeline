import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { createPlanEntrySchema, parseBody } from '@/lib/schemas'
import { isSunday } from '../helpers'
import type { MealType, PlanEntry, RecipeJoinResult } from '@/types'

export const POST = withAuth(async (req, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, createPlanEntrySchema)
  if (parseError) return parseError

  const { week_start, date, recipe_id, meal_type, parent_entry_id } = body
  const is_side_dish = meal_type === 'dessert' ? true : (body.is_side_dish ?? false)

  // Validate week_start is a Sunday
  if (!isSunday(week_start)) {
    return NextResponse.json({ error: 'week_start must be a Sunday' }, { status: 400 })
  }

  // Validate date falls within the week of week_start
  const weekStartDate = new Date(week_start + 'T12:00:00Z')
  const entryDate = new Date(date + 'T12:00:00Z')
  const diffDays = Math.round((entryDate.getTime() - weekStartDate.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0 || diffDays > 6) {
    return NextResponse.json({ error: 'date must fall within the week of week_start' }, { status: 400 })
  }

  // Non-dessert side dishes only allowed for Dinner and Lunch
  if (is_side_dish && meal_type !== 'dessert' && meal_type !== 'dinner' && meal_type !== 'lunch') {
    return NextResponse.json({ error: 'Side dishes are only allowed for Dinner and Lunch slots.' }, { status: 400 })
  }

  // Non-dessert side dish requires parent_entry_id
  if (is_side_dish && meal_type !== 'dessert' && !parent_entry_id) {
    return NextResponse.json({ error: 'parent_entry_id is required for side dish entries' }, { status: 400 })
  }

  // Dessert requires parent_entry_id
  if (meal_type === 'dessert' && !parent_entry_id) {
    return NextResponse.json({ error: 'parent_entry_id is required for dessert entries' }, { status: 400 })
  }

  // Dessert parent must be a Dinner or Lunch slot
  if (meal_type === 'dessert' && parent_entry_id) {
    const { data: parentEntry } = await db
      .from('meal_plan_entries')
      .select('meal_type')
      .eq('id', parent_entry_id)
      .maybeSingle()
    if (!parentEntry || (parentEntry.meal_type !== 'dinner' && parentEntry.meal_type !== 'lunch')) {
      return NextResponse.json({ error: 'Dessert entries are only allowed for Dinner and Lunch slots.' }, { status: 400 })
    }
  }

  // Upsert meal_plans on (household_id, week_start) or (user_id, week_start)
  let existingPlanQ = db
    .from('meal_plans')
    .select('id')
    .eq('week_start', week_start)
  if (ctx) {
    existingPlanQ = existingPlanQ.eq('household_id', ctx.householdId)
  } else {
    existingPlanQ = existingPlanQ.eq('user_id', user.id)
  }
  const { data: existingPlan } = await existingPlanQ.maybeSingle()

  let planId: string
  if (existingPlan?.id) {
    planId = existingPlan.id
  } else {
    const insertPayload = ctx
      ? { household_id: ctx.householdId, user_id: user.id, week_start }
      : { user_id: user.id, week_start }
    const { data: newPlan, error: planError } = await db
      .from('meal_plans')
      .insert(insertPayload)
      .select('id')
      .single()
    if (planError || !newPlan) {
      return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
    }
    planId = newPlan.id
  }

  // Insert the entry
  const { data: entry, error: entryError } = await db
    .from('meal_plan_entries')
    .insert({
      meal_plan_id:    planId,
      recipe_id,
      planned_date:    date,
      position:        1,
      confirmed:       true,
      meal_type,
      is_side_dish,
      parent_entry_id: parent_entry_id ?? null,
    })
    .select('id, recipe_id, planned_date, position, confirmed, meal_type, is_side_dish, parent_entry_id, recipes(title, total_time_minutes)')
    .single()

  if (entryError || !entry) {
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }

  const planEntry: PlanEntry = {
    id:              entry.id,
    recipe_id:       entry.recipe_id,
    recipe_title:    (entry.recipes as unknown as RecipeJoinResult | null)?.title ?? '',
    planned_date:    entry.planned_date,
    meal_type:       entry.meal_type as MealType,
    is_side_dish:    entry.is_side_dish,
    parent_entry_id: entry.parent_entry_id,
    confirmed:       entry.confirmed,
    position:           entry.position,
    total_time_minutes: (entry.recipes as unknown as RecipeJoinResult | null)?.total_time_minutes ?? null,
  }

  return NextResponse.json(planEntry, { status: 201 })
})
