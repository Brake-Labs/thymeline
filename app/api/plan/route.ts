import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { createPlanSchema, parseBody } from '@/lib/schemas'
import { getOrCreateMealPlan } from './helpers'
import { db } from '@/lib/db'
import { eq, and, asc } from 'drizzle-orm'
import { mealPlans, mealPlanEntries, recipes } from '@/lib/db/schema'
import { scopeCondition } from '@/lib/household'
import { dbFirst } from '@/lib/db/helpers'
import type { MealType, SavedPlanEntry } from '@/types'

// ── POST /api/plan — save confirmed plan ───────────────────────────────────────

export const POST = withAuth(async (req, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, createPlanSchema)
  if (parseError) return parseError

  const { weekStart, entries } = body

  const planResult = await getOrCreateMealPlan(user.id, weekStart, ctx)
  if ('error' in planResult) {
    console.error('meal_plans insert error:', planResult.error)
    return NextResponse.json({ error: `Failed to create plan: ${planResult.error}` }, { status: 500 })
  }
  const { planId } = planResult

  // Delete existing entries for this plan, then insert fresh ones
  await db.delete(mealPlanEntries).where(eq(mealPlanEntries.mealPlanId, planId))

  const newEntries = entries.map((e) => ({
    mealPlanId:    planId,
    recipeId:      e.recipeId,
    plannedDate:   e.date,
    position:      1,
    confirmed:     true,
    mealType:      e.mealType ?? 'dinner',
    isSideDish:    e.isSideDish ?? false,
    parentEntryId: e.parentEntryId ?? null,
  }))

  try {
    const savedEntries = await db.insert(mealPlanEntries).values(newEntries).returning({
      id: mealPlanEntries.id,
      mealPlanId: mealPlanEntries.mealPlanId,
      recipeId: mealPlanEntries.recipeId,
      plannedDate: mealPlanEntries.plannedDate,
      position: mealPlanEntries.position,
      confirmed: mealPlanEntries.confirmed,
      mealType: mealPlanEntries.mealType,
      isSideDish: mealPlanEntries.isSideDish,
      parentEntryId: mealPlanEntries.parentEntryId,
    })

    // Map to snake_case for response
    const responseEntries: SavedPlanEntry[] = savedEntries.map((e) => ({
      id:              e.id,
      mealPlanId:    e.mealPlanId,
      recipeId:       e.recipeId,
      plannedDate:    e.plannedDate,
      position:        e.position,
      confirmed:       e.confirmed,
      mealType:       e.mealType as MealType,
      isSideDish:    e.isSideDish,
      parentEntryId: e.parentEntryId,
    }))

    return NextResponse.json({ planId, entries: responseEntries })
  } catch (err) {
    console.error('meal_plan_entries insert error:', err)
    return NextResponse.json({ error: `Failed to save entries: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 })
  }
})

// ── GET /api/plan?weekStart=YYYY-MM-DD — fetch existing plan ──────────────────

export const GET = withAuth(async (req, { user, ctx }) => {
  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('weekStart')

  if (!weekStart) {
    return NextResponse.json({ error: 'weekStart is required' }, { status: 400 })
  }

  const planRows = await db
    .select({ id: mealPlans.id, weekStart: mealPlans.weekStart })
    .from(mealPlans)
    .where(and(
      eq(mealPlans.weekStart, weekStart),
      scopeCondition({ userId: mealPlans.userId, householdId: mealPlans.householdId }, user.id, ctx),
    ))
    .limit(1)

  const plan = dbFirst(planRows)

  if (!plan) {
    return NextResponse.json({ plan: null })
  }

  const entries = await db
    .select({
      id: mealPlanEntries.id,
      plannedDate: mealPlanEntries.plannedDate,
      recipeId: mealPlanEntries.recipeId,
      position: mealPlanEntries.position,
      confirmed: mealPlanEntries.confirmed,
      mealType: mealPlanEntries.mealType,
      isSideDish: mealPlanEntries.isSideDish,
      parentEntryId: mealPlanEntries.parentEntryId,
      recipeTitle: recipes.title,
      totalTimeMinutes: recipes.totalTimeMinutes,
    })
    .from(mealPlanEntries)
    .innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
    .where(eq(mealPlanEntries.mealPlanId, plan.id))
    .orderBy(asc(mealPlanEntries.plannedDate))

  const enrichedEntries = entries.map((e) => ({
    id:              e.id,
    plannedDate:    e.plannedDate,
    recipeId:       e.recipeId,
    recipeTitle:    e.recipeTitle ?? '',
    position:        e.position,
    confirmed:       e.confirmed,
    mealType:       e.mealType,
    isSideDish:    e.isSideDish,
    parentEntryId:    e.parentEntryId,
    totalTimeMinutes: e.totalTimeMinutes ?? null,
  }))

  return NextResponse.json({
    plan: {
      id:         plan.id,
      weekStart: plan.weekStart,
      entries:    enrichedEntries,
    },
  })
})
