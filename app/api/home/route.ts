import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { getMostRecentSunday } from '@/lib/date-utils'
import type { HomeData } from '@/types'

export const GET = withAuth(async (req, { user, db, ctx }) => {
  const weekStart = getMostRecentSunday()

  let planQ = db.from('meal_plans').select('id, week_start').eq('week_start', weekStart)
  if (ctx) {
    planQ = planQ.eq('household_id', ctx.householdId)
  } else {
    planQ = planQ.eq('user_id', user.id)
  }
  const { data: plan } = await planQ.single()

  let currentWeekPlan: HomeData['currentWeekPlan'] = null

  if (plan) {
    const { data: entries } = await db
      .from('meal_plan_entries')
      .select('planned_date, recipe_id, position, confirmed, recipes(title, total_time_minutes)')
      .eq('meal_plan_id', plan.id)
      .order('planned_date')
      .order('position')

    currentWeekPlan = {
      id: plan.id,
      week_start: plan.week_start,
      entries: (entries ?? []).filter((e) => e.recipe_id != null).map((e) => ({
        planned_date:       e.planned_date,
        recipe_id:          e.recipe_id!,
        recipe_title:       e.recipes?.title ?? '',
        position:           e.position,
        confirmed:          e.confirmed ?? false,
        total_time_minutes: e.recipes?.total_time_minutes ?? null,
      })),
    }
  }

  // Fetch history, recipe count, user name, and grocery list in parallel
  let recipeCountQ = db.from('recipes').select('id', { count: 'exact', head: true })
  if (ctx) {
    recipeCountQ = recipeCountQ.eq('household_id', ctx.householdId)
  } else {
    recipeCountQ = recipeCountQ.eq('user_id', user.id)
  }

  let groceryQ = db.from('grocery_lists').select('week_start').order('week_start', { ascending: false }).limit(1)
  if (ctx) {
    groceryQ = groceryQ.eq('household_id', ctx.householdId)
  } else {
    groceryQ = groceryQ.eq('user_id', user.id)
  }

  const [
    { data: history },
    { count: recipeCount },
    { data: groceryLists },
  ] = await Promise.all([
    db.from('recipe_history')
      .select('recipe_id, made_on, recipes(title, tags)')
      .eq('user_id', user.id)
      .order('made_on', { ascending: false })
      .limit(3),
    recipeCountQ,
    groceryQ,
  ])

  const recentlyMade = (history ?? []).filter((h) => h.recipe_id != null).map((h) => ({
    recipe_id:    h.recipe_id!,
    recipe_title: h.recipes?.title ?? '',
    made_on:      h.made_on,
    tags:         h.recipes?.tags ?? [],
  }))

  const userName = user.user_metadata?.full_name ?? user.email ?? null
  const groceryListWeekStart = groceryLists?.[0]?.week_start ?? null

  const result: HomeData = {
    userName,
    recipeCount: recipeCount ?? 0,
    groceryListWeekStart,
    currentWeekPlan,
    recentlyMade,
  }
  return NextResponse.json(result)
})
