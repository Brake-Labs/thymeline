import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { suggestSchema, parseBody } from '@/lib/schemas'
import { getTodayISO, getMostRecentSunday } from '@/lib/date-utils'
import { parseLLMJsonSafe } from '@/lib/llm'
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
import { scopeQuery } from '@/lib/household'
import type { DaySuggestions, MealType } from '@/types'

export const POST = withAuth(async (req: NextRequest, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, suggestSchema)
  if (parseError) return parseError

  const { week_start, active_dates, prefer_this_week, avoid_this_week, free_text } = body
  const active_meal_types: MealType[] = body.active_meal_types?.length ? body.active_meal_types : ['dinner']

  if (!isSunday(week_start)) {
    return NextResponse.json({ error: 'week_start must be a Sunday' }, { status: 400 })
  }

  const todayISO = getTodayISO()

  const prefs = await fetchUserPreferences(db, user.id, ctx)
  const cooldownDays = prefs?.cooldown_days ?? 28
  const recipesByMealType = await fetchRecipesByMealTypes(db, user.id, cooldownDays, active_meal_types, ctx)
  const recentHistory = await fetchRecentHistory(db, user.id)

  // Exclude recipes already planned in any week that overlaps with "now or future".
  // This covers two cases:
  //   1. Recipes already placed in the week being suggested for (same week_start).
  //   2. Recipes placed in the *current* week when suggesting a future week, so a
  //      recipe the user is cooking this week is never suggested for next week.
  const alreadyPlannedIds = new Set<string>()

  const weekStartsToCheck = new Set<string>([week_start])
  const thisWeekStart = getMostRecentSunday()
  if (thisWeekStart !== week_start) weekStartsToCheck.add(thisWeekStart)

  for (const ws of weekStartsToCheck) {
    const planQ = scopeQuery(db
      .from('meal_plans')
      .select('id')
      .eq('week_start', ws), user.id, ctx)
    const { data: plan } = await planQ.maybeSingle()
    if (!plan?.id) continue

    const { data: entries } = await db
      .from('meal_plan_entries')
      .select('recipe_id')
      .eq('meal_plan_id', plan.id)
      .gte('planned_date', todayISO)
    for (const entry of entries ?? []) {
      alreadyPlannedIds.add((entry as { recipe_id: string }).recipe_id)
    }
  }

  if (alreadyPlannedIds.size > 0) {
    for (const mt of Object.keys(recipesByMealType) as MealType[]) {
      recipesByMealType[mt] = recipesByMealType[mt].filter((r) => !alreadyPlannedIds.has(r.id))
    }
  }

  const totalRecipes = Object.values(recipesByMealType).reduce((n, r) => n + r.length, 0)
  console.warn(`[suggest] user=${user.id} total_recipes_after_cooldown=${totalRecipes} cooldown_days=${cooldownDays}`)
  if (totalRecipes === 0) {
    console.warn(`[suggest] 0 recipes available — cooldown may be excluding all recipes`)
  }

  const today = new Date()
  const season = getSeason(today.getMonth())

  const systemMessage = buildSystemMessage(prefs, prefer_this_week ?? [], avoid_this_week ?? [], season)
  const pantryContext = await fetchPantryContext(db, user.id, ctx)
  const userMessage = buildFullWeekUserMessage(
    active_dates,
    recipesByMealType,
    recentHistory,
    free_text ?? '',
    active_meal_types,
    pantryContext,
  )

  const validIdsByMealType = new Map<MealType, Set<string>>()
  for (const [mt, recipes] of Object.entries(recipesByMealType) as [MealType, typeof recipesByMealType[MealType]][]) {
    validIdsByMealType.set(mt, new Set(recipes.map((r) => r.id)))
  }

  try {
    const raw = await callLLMNonStreaming(systemMessage, userMessage)
    console.warn(`[suggest] raw_llm_response=${raw.slice(0, 500)}${raw.length > 500 ? '…' : ''}`)
    const parsed = parseLLMJsonSafe<{ days: DaySuggestions[] }>(raw)
    if (!parsed || !Array.isArray(parsed.days)) {
      console.error('[suggest] Invalid LLM response structure')
      return NextResponse.json({ error: 'Suggestion failed. Please try again.' }, { status: 500 })
    }
    const validated = validateSuggestions(parsed.days, validIdsByMealType)
    return NextResponse.json({ days: validated })
  } catch (err) {
    console.error('LLM suggest error:', err)
    return NextResponse.json({ error: 'Suggestion failed. Please try again.' }, { status: 500 })
  }
})
