import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { resolveHouseholdScope } from '@/lib/household'
import { HomeData } from '@/types'

function getCurrentWeekStart(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - diff)
  return monday.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const weekStart = getCurrentWeekStart()

  const db = createAdminClient()
  const ctx = await resolveHouseholdScope(db, user.id)

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
      .select('planned_date, recipe_id, position, confirmed, recipes(title)')
      .eq('meal_plan_id', plan.id)
      .order('planned_date')
      .order('position')

    currentWeekPlan = {
      id: plan.id,
      week_start: plan.week_start,
      entries: (entries ?? []).map((e) => ({
        planned_date:  e.planned_date,
        recipe_id:     e.recipe_id,
        recipe_title:  ((e.recipes as unknown) as { title: string } | null)?.title ?? '',
        position:      e.position,
        confirmed:     e.confirmed,
      })),
    }
  }

  // History is always per-requesting-user, never household-scoped
  const { data: history } = await db
    .from('recipe_history')
    .select('recipe_id, made_on, recipes(title)')
    .eq('user_id', user.id)
    .order('made_on', { ascending: false })
    .limit(3)

  const recentlyMade = (history ?? []).map((h) => ({
    recipe_id:    h.recipe_id,
    recipe_title: ((h.recipes as unknown) as { title: string } | null)?.title ?? '',
    made_on:      h.made_on,
  }))

  const result: HomeData = { currentWeekPlan, recentlyMade }
  return NextResponse.json(result)
}
