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

  const { weekStart, date, recipeId, mealType, parentEntryId } = body
  const isSideDish = mealType === 'dessert' ? true : (body.isSideDish ?? false)

  // Validate date falls within the week of weekStart
  const weekStartDate = new Date(weekStart + 'T12:00:00Z')
  const entryDate = new Date(date + 'T12:00:00Z')
  const diffDays = Math.round((entryDate.getTime() - weekStartDate.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0 || diffDays > 6) {
    return NextResponse.json({ error: 'date must fall within the week of weekStart' }, { status: 400 })
  }

  // Non-dessert side dishes only allowed for Dinner and Lunch
  if (isSideDish && mealType !== 'dessert' && mealType !== 'dinner' && mealType !== 'lunch') {
    return NextResponse.json({ error: 'Side dishes are only allowed for Dinner and Lunch slots.' }, { status: 400 })
  }

  // Non-dessert side dish requires parentEntryId
  if (isSideDish && mealType !== 'dessert' && !parentEntryId) {
    return NextResponse.json({ error: 'parentEntryId is required for side dish entries' }, { status: 400 })
  }

  // Dessert requires parentEntryId
  if (mealType === 'dessert' && !parentEntryId) {
    return NextResponse.json({ error: 'parentEntryId is required for dessert entries' }, { status: 400 })
  }

  // Dessert parent must be a Dinner or Lunch slot
  if (mealType === 'dessert' && parentEntryId) {
    const parentRows = await db
      .select({ mealType: mealPlanEntries.mealType })
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, parentEntryId))
      .limit(1)
    const parentEntry = dbFirst(parentRows)
    if (!parentEntry || (parentEntry.mealType !== 'dinner' && parentEntry.mealType !== 'lunch')) {
      return NextResponse.json({ error: 'Dessert entries are only allowed for Dinner and Lunch slots.' }, { status: 400 })
    }
  }

  // Verify the recipe belongs to this user/household
  const ownership = await checkOwnership('recipes', recipeId, user.id, ctx)
  if (!ownership.owned) {
    return NextResponse.json({ error: 'Recipe not found' }, { status: ownership.status })
  }

  const planResult = await getOrCreateMealPlan(user.id, weekStart, ctx)
  if ('error' in planResult) {
    console.error('[entries] getOrCreateMealPlan error:', planResult.error)
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
  }
  const { planId } = planResult

  try {
    // Insert the entry
    const [entry] = await db.insert(mealPlanEntries).values({
      mealPlanId:    planId,
      recipeId:      recipeId,
      plannedDate:   date,
      position:      1,
      confirmed:     true,
      mealType:      mealType,
      isSideDish:    isSideDish,
      parentEntryId: parentEntryId ?? null,
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
      recipeId:       result.recipeId,
      recipeTitle:    result.recipeTitle ?? '',
      plannedDate:    result.plannedDate,
      mealType:       result.mealType as MealType,
      isSideDish:    result.isSideDish,
      parentEntryId: result.parentEntryId,
      confirmed:       result.confirmed,
      position:           result.position,
      totalTimeMinutes: result.totalTimeMinutes ?? null,
    }

    return NextResponse.json(planEntry, { status: 201 })
  } catch (err) {
    console.error('[entries] insert error:', err)
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }
})
