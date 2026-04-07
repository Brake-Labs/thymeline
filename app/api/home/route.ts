import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { getMostRecentSunday } from '@/lib/date-utils'
import { scopeCondition } from '@/lib/household'
import { db } from '@/lib/db'
import { mealPlans, mealPlanEntries, recipes, recipeHistory, groceryLists } from '@/lib/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { dbFirst } from '@/lib/db/helpers'
import type { HomeData } from '@/types'

export const GET = withAuth(async (req, { user, ctx }) => {
  const weekStart = getMostRecentSunday()

  // Find the current week's plan
  const planRows = await db
    .select({ id: mealPlans.id, week_start: mealPlans.weekStart })
    .from(mealPlans)
    .where(and(
      eq(mealPlans.weekStart, weekStart),
      scopeCondition({ userId: mealPlans.userId, householdId: mealPlans.householdId }, user.id, ctx),
    ))

  const plan = dbFirst(planRows)

  let currentWeekPlan: HomeData['currentWeekPlan'] = null

  if (plan) {
    const entries = await db
      .select({
        planned_date: mealPlanEntries.plannedDate,
        recipe_id: mealPlanEntries.recipeId,
        position: mealPlanEntries.position,
        confirmed: mealPlanEntries.confirmed,
        recipe_title: recipes.title,
        total_time_minutes: recipes.totalTimeMinutes,
      })
      .from(mealPlanEntries)
      .innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
      .where(eq(mealPlanEntries.mealPlanId, plan.id))
      .orderBy(mealPlanEntries.plannedDate, mealPlanEntries.position)

    currentWeekPlan = {
      id: plan.id,
      week_start: plan.week_start,
      entries: entries.map((e) => ({
        planned_date:       e.planned_date,
        recipe_id:          e.recipe_id,
        recipe_title:       e.recipe_title ?? '',
        position:           e.position,
        confirmed:          e.confirmed,
        total_time_minutes: e.total_time_minutes ?? null,
      })),
    }
  }

  // Fetch history, recipe count, and grocery list in parallel
  const [historyRows, recipeCountRows, groceryRows] = await Promise.all([
    db
      .select({
        recipe_id: recipeHistory.recipeId,
        made_on: recipeHistory.madeOn,
        recipe_title: recipes.title,
        tags: recipes.tags,
      })
      .from(recipeHistory)
      .innerJoin(recipes, eq(recipeHistory.recipeId, recipes.id))
      .where(eq(recipeHistory.userId, user.id))
      .orderBy(desc(recipeHistory.madeOn))
      .limit(3),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(recipes)
      .where(scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, user.id, ctx)),
    db
      .select({ week_start: groceryLists.weekStart })
      .from(groceryLists)
      .where(scopeCondition({ userId: groceryLists.userId, householdId: groceryLists.householdId }, user.id, ctx))
      .orderBy(desc(groceryLists.weekStart))
      .limit(1),
  ])

  const recentlyMade = historyRows.map((h) => ({
    recipe_id:    h.recipe_id,
    recipe_title: h.recipe_title ?? '',
    made_on:      h.made_on,
    tags:         h.tags ?? [],
  }))

  const userName = user.name ?? user.email ?? null
  const recipeCount = recipeCountRows[0]?.count ?? 0
  const groceryListWeekStart = groceryRows[0]?.week_start ?? null

  const result: HomeData = {
    userName,
    recipeCount,
    groceryListWeekStart,
    currentWeekPlan,
    recentlyMade,
  }
  return NextResponse.json(result)
})
