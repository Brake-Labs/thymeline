import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { createPlanEntrySchema, parseBody } from '@/lib/schemas'
import { getOrCreateMealPlan } from '../helpers'
import type { MealType, PlanEntry } from '@/types'

export const POST = withAuth(async (req, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, createPlanEntrySchema)
  if (parseError) return parseError

  const { week_start, date, recipe_id, meal_type, parent_entry_id } = body
  const is_side_dish = meal_type === 'dessert' ? true : (body.is_side_dish ?? false)

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

  const planResult = await getOrCreateMealPlan(db, user.id, week_start, ctx)
  if ('error' in planResult) {
    console.error('[entries] getOrCreateMealPlan error:', planResult.error)
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
  }
  const { planId } = planResult

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
    console.error('[entries] insert error:', entryError)
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }

  const planEntry: PlanEntry = {
    id:              entry.id,
    recipe_id:       entry.recipe_id,
    recipe_title:    entry.recipes?.title ?? '',
    planned_date:    entry.planned_date,
    meal_type:       entry.meal_type as MealType,
    is_side_dish:    entry.is_side_dish,
    parent_entry_id: entry.parent_entry_id,
    confirmed:       entry.confirmed,
    position:           entry.position,
    total_time_minutes: entry.recipes?.total_time_minutes ?? null,
  }

  return NextResponse.json(planEntry, { status: 201 })
})
