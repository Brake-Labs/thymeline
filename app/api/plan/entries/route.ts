import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { createPlanEntrySchema, parseBody } from '@/lib/schemas'
import { getOrCreateMealPlan } from '../helpers'
import { checkOwnership } from '@/lib/household'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { mealPlanEntries, recipes } from '@/lib/db/schema'
import { dbFirst } from '@/lib/db/helpers'
import type { MealType, PlanEntry } from '@/types'

export const POST = withAuth(async (req, { user, ctx }) => {
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
    const parentRows = await db
      .select({ mealType: mealPlanEntries.mealType })
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, parent_entry_id))
      .limit(1)
    const parentEntry = dbFirst(parentRows)
    if (!parentEntry || (parentEntry.mealType !== 'dinner' && parentEntry.mealType !== 'lunch')) {
      return NextResponse.json({ error: 'Dessert entries are only allowed for Dinner and Lunch slots.' }, { status: 400 })
    }
  }

  // Verify the recipe belongs to this user/household
  const ownership = await checkOwnership('recipes', recipe_id, user.id, ctx)
  if (!ownership.owned) {
    return NextResponse.json({ error: 'Recipe not found' }, { status: ownership.status })
  }

  const planResult = await getOrCreateMealPlan(user.id, week_start, ctx)
  if ('error' in planResult) {
    console.error('[entries] getOrCreateMealPlan error:', planResult.error)
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
  }
  const { planId } = planResult

  try {
    // Insert the entry
    const [entry] = await db.insert(mealPlanEntries).values({
      mealPlanId:    planId,
      recipeId:      recipe_id,
      plannedDate:   date,
      position:      1,
      confirmed:     true,
      mealType:      meal_type,
      isSideDish:    is_side_dish,
      parentEntryId: parent_entry_id ?? null,
    }).returning()

    if (!entry) {
      return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
    }

    // Fetch joined recipe data
    const resultRows = await db.select({
      id: mealPlanEntries.id,
      recipeId: mealPlanEntries.recipeId,
      plannedDate: mealPlanEntries.plannedDate,
      position: mealPlanEntries.position,
      confirmed: mealPlanEntries.confirmed,
      mealType: mealPlanEntries.mealType,
      isSideDish: mealPlanEntries.isSideDish,
      parentEntryId: mealPlanEntries.parentEntryId,
      recipeTitle: recipes.title,
      totalTimeMinutes: recipes.totalTimeMinutes,
    }).from(mealPlanEntries)
      .innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
      .where(eq(mealPlanEntries.id, entry.id))

    const result = dbFirst(resultRows)
    if (!result) {
      return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
    }

    const planEntry: PlanEntry = {
      id:              result.id,
      recipe_id:       result.recipeId,
      recipe_title:    result.recipeTitle ?? '',
      planned_date:    result.plannedDate,
      meal_type:       result.mealType as MealType,
      is_side_dish:    result.isSideDish,
      parent_entry_id: result.parentEntryId,
      confirmed:       result.confirmed,
      position:           result.position,
      total_time_minutes: result.totalTimeMinutes ?? null,
    }

    return NextResponse.json(planEntry, { status: 201 })
  } catch (err) {
    console.error('[entries] insert error:', err)
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }
})
