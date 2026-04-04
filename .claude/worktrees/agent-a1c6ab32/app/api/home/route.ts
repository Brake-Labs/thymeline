import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { getMostRecentSunday } from '@/lib/date-utils'
import { scopeQuery } from '@/lib/household'
import type { HomeData } from '@/types'

export const GET = withAuth(async (req, { user, db, ctx }) => {
  const weekStart = getMostRecentSunday()

  const { data: plan } = await scopeQuery(db.from('meal_plans').select('id, week_start').eq('week_start', weekStart), user.id, ctx).single()

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
      entries: (entries ?? []).map((e) => ({
        planned_date:       e.planned_date,
        recipe_id:          e.recipe_id,
        recipe_title:       e.recipes?.title ?? '',
        position:           e.position,
        confirmed:          e.confirmed,
        total_time_minutes: e.recipes?.total_time_minutes ?? null,
      })),
    }
  }

  // Fetch history, recipe count, user name, and grocery list in parallel
  const recipeCountQ = scopeQuery(db.from('recipes').select('id', { count: 'exact', head: true }), user.id, ctx)

  const groceryQ = scopeQuery(db.from('grocery_lists').select('week_start').order('week_start', { ascending: false }).limit(1), user.id, ctx)

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

  const recentlyMade = (history ?? []).map((h) => ({
    recipe_id:    h.recipe_id,
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
