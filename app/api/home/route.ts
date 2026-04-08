import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { getMostRecentWeekStart, dayNameToNumber } from '@/lib/date-utils'
import { scopeCondition } from '@/lib/household'
import { db } from '@/lib/db'
import { mealPlans, mealPlanEntries, recipes, recipeHistory, groceryLists, userPreferences } from '@/lib/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { dbFirst } from '@/lib/db/helpers'
import type { HomeData } from '@/types'

export const GET = withAuth(async (req, { user, ctx }) => {
  const prefRows = await db
    .select({ weekStartDay: userPreferences.weekStartDay })
    .from(userPreferences)
    .where(scopeCondition({ userId: userPreferences.userId, householdId: userPreferences.householdId }, user.id, ctx))
    .limit(1)

  const weekStart = getMostRecentWeekStart(dayNameToNumber(prefRows[0]?.weekStartDay ?? 'sunday'))

  // Find the current week's plan
  const planRows = await db
    .select({ id: mealPlans.id, weekStart: mealPlans.weekStart })
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
        plannedDate: mealPlanEntries.plannedDate,
        recipeId: mealPlanEntries.recipeId,
        position: mealPlanEntries.position,
        confirmed: mealPlanEntries.confirmed,
        recipeTitle: recipes.title,
        totalTimeMinutes: recipes.totalTimeMinutes,
      })
      .from(mealPlanEntries)
      .innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
      .where(eq(mealPlanEntries.mealPlanId, plan.id))
      .orderBy(mealPlanEntries.plannedDate, mealPlanEntries.position)

    currentWeekPlan = {
      id: plan.id,
      weekStart: plan.weekStart,
      entries: entries.map((e) => ({
        plannedDate:       e.plannedDate,
        recipeId:          e.recipeId,
        recipeTitle:       e.recipeTitle ?? '',
        position:           e.position,
        confirmed:          e.confirmed,
        totalTimeMinutes: e.totalTimeMinutes ?? null,
      })),
    }
  }

  // Fetch history, recipe count, and grocery list in parallel
  const [historyRows, recipeCountRows, groceryRows] = await Promise.all([
    db
      .select({
        recipeId: recipeHistory.recipeId,
        madeOn: recipeHistory.madeOn,
        recipeTitle: recipes.title,
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
      .select({ weekStart: groceryLists.weekStart })
      .from(groceryLists)
      .where(scopeCondition({ userId: groceryLists.userId, householdId: groceryLists.householdId }, user.id, ctx))
      .orderBy(desc(groceryLists.weekStart))
      .limit(1),
  ])

  const recentlyMade = historyRows.map((h) => ({
    recipeId:    h.recipeId,
    recipeTitle: h.recipeTitle ?? '',
    madeOn:      h.madeOn,
    tags:         h.tags ?? [],
  }))

  const userName = user.name ?? user.email ?? null
  const recipeCount = recipeCountRows[0]?.count ?? 0
  const groceryListWeekStart = groceryRows[0]?.weekStart ?? null

  const result: HomeData = {
    userName,
    recipeCount,
    groceryListWeekStart,
    currentWeekPlan,
    recentlyMade,
  }
  return NextResponse.json(result)
})
