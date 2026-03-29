import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { resolveHouseholdScope } from '@/lib/household'
import {
  getSeason,
  isSunday,
  fetchRecipesByMealTypes,
  fetchRecentHistory,
  fetchUserPreferences,
  buildSystemMessage,
  buildFullWeekUserMessage,
  fetchPantryContext,
  validateSuggestions,
  callLLMNonStreaming,
} from '../helpers'
import type { DaySuggestions, MealType } from '@/types'

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    week_start: string
    active_dates: string[]
    active_meal_types?: MealType[]
    prefer_this_week: string[]
    avoid_this_week: string[]
    free_text: string
    specific_requests: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { week_start, active_dates, prefer_this_week, avoid_this_week, free_text, specific_requests } = body
  const active_meal_types: MealType[] = body.active_meal_types?.length ? body.active_meal_types : ['dinner']

  if (!active_dates || active_dates.length === 0) {
    return NextResponse.json({ error: 'active_dates must be non-empty' }, { status: 400 })
  }
  if (!isSunday(week_start)) {
    return NextResponse.json({ error: 'week_start must be a Sunday' }, { status: 400 })
  }

  const db = createAdminClient()
  const ctx = await resolveHouseholdScope(db, user.id)
  const todayISO = new Date().toISOString().slice(0, 10)

  const prefs = await fetchUserPreferences(supabase, user.id, ctx)
  const cooldownDays = prefs?.cooldown_days ?? 28
  const recipesByMealType = await fetchRecipesByMealTypes(supabase, user.id, cooldownDays, active_meal_types, ctx)
  const recentHistory = await fetchRecentHistory(supabase, user.id)

  // Exclude recipes already confirmed for future dates (including today) in the current week
  let currentPlanQ = db
    .from('meal_plans')
    .select('id')
    .eq('week_start', week_start)
  if (ctx) {
    currentPlanQ = currentPlanQ.eq('household_id', ctx.householdId)
  } else {
    currentPlanQ = currentPlanQ.eq('user_id', user.id)
  }
  const { data: currentPlan } = await currentPlanQ.maybeSingle()

  const alreadyPlannedIds = new Set<string>()
  if (currentPlan?.id) {
    const { data: existingEntries } = await db
      .from('meal_plan_entries')
      .select('recipe_id, planned_date')
      .eq('meal_plan_id', currentPlan.id)
      .gte('planned_date', todayISO)
    for (const entry of existingEntries ?? []) {
      alreadyPlannedIds.add((entry as { recipe_id: string }).recipe_id)
    }
  }

  if (alreadyPlannedIds.size > 0) {
    for (const mt of Object.keys(recipesByMealType) as MealType[]) {
      recipesByMealType[mt] = recipesByMealType[mt].filter((r) => !alreadyPlannedIds.has(r.id))
    }
  }

  const totalRecipes = Object.values(recipesByMealType).reduce((n, r) => n + r.length, 0)
  console.log(`[suggest] user=${user.id} total_recipes_after_cooldown=${totalRecipes} cooldown_days=${cooldownDays}`)
  if (totalRecipes === 0) {
    console.warn(`[suggest] 0 recipes available — cooldown may be excluding all recipes`)
  }

  const today = new Date()
  const season = getSeason(today.getMonth())

  const systemMessage = buildSystemMessage(prefs, prefer_this_week ?? [], avoid_this_week ?? [], season)
  const pantryContext = await fetchPantryContext(supabase, user.id, ctx)
  const userMessage = buildFullWeekUserMessage(
    active_dates,
    recipesByMealType,
    recentHistory,
    free_text ?? '',
    specific_requests ?? '',
    active_meal_types,
    pantryContext,
  )

  const validIdsByMealType = new Map<MealType, Set<string>>()
  for (const [mt, recipes] of Object.entries(recipesByMealType) as [MealType, typeof recipesByMealType[MealType]][]) {
    validIdsByMealType.set(mt, new Set(recipes.map((r) => r.id)))
  }

  try {
    const raw = await callLLMNonStreaming(systemMessage, userMessage)
    console.log(`[suggest] raw_llm_response=${raw.slice(0, 500)}${raw.length > 500 ? '…' : ''}`)
    const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
    const parsed = JSON.parse(stripped) as { days: DaySuggestions[] }
    const validated = validateSuggestions(parsed.days ?? [], validIdsByMealType)
    return NextResponse.json({ days: validated })
  } catch (err) {
    console.error('LLM suggest error:', err)
    return NextResponse.json({ error: 'Suggestion failed. Please try again.' }, { status: 500 })
  }
}
