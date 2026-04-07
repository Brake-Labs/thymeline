import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { suggestSchema, parseBody } from '@/lib/schemas'
import { logger } from '@/lib/logger'
import { getTodayISO } from '@/lib/date-utils'
import { parseLLMJsonSafe, callLLM } from '@/lib/llm'
import {
  getSeason,
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
import { deriveTasteProfile } from '@/lib/taste-profile'
import { detectWasteOverlap, getPrimaryWasteBadgeText, type RecipeForOverlap } from '@/lib/waste-overlap'
import type { DaySuggestions, MealType, WasteMatch } from '@/types'

const WASTE_DETECTION_TIMEOUT_MS = 8000

export const POST = withAuth(async (req: NextRequest, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, suggestSchema)
  if (parseError) return parseError

  const { week_start, active_dates, prefer_this_week, avoid_this_week, free_text } = body
  const active_meal_types: MealType[] = body.active_meal_types?.length ? body.active_meal_types : ['dinner']

  const todayISO = getTodayISO()

  const [prefs, tasteProfile] = await Promise.all([
    fetchUserPreferences(db, user.id, ctx),
    deriveTasteProfile(user.id, db, ctx ?? null),
  ])
  const cooldownDays = prefs?.cooldown_days ?? 28
  const recipesByMealType = await fetchRecipesByMealTypes(db, user.id, cooldownDays, active_meal_types, ctx)
  const recentHistory = await fetchRecentHistory(db, user.id)

  // Exclude recipes already planned for any future date across ALL of the user's
  // meal plans.  Previously only the current week and target week were checked,
  // which missed recipes scheduled for weeks in between (e.g. a recipe set for
  // April 8 was still suggested for April 19 even with a 30-day cooldown).
  const alreadyPlannedIds = new Set<string>()

  // Fetch every plan that belongs to this user/household in one query, then
  // pull all entries with planned_date >= today in a single batch per plan.
  const allPlansQ = scopeQuery(
    db.from('meal_plans').select('id, week_start'),
    user.id, ctx,
  )
  const { data: allPlans } = await allPlansQ

  for (const plan of (allPlans ?? []) as { id: string; week_start: string }[]) {
    // For the target week: only exclude entries from today onward — earlier
    // slots in the same week are already confirmed and shouldn't block the
    // remaining days being suggested.
    // For every other week: still use today as the lower bound so that only
    // future-scheduled meals are excluded; past meals are handled by the
    // cooldown filter against recipe_history.
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

  // Filter out disliked recipes; build loved set for prompt annotations
  const dislikedSet = new Set(tasteProfile.disliked_recipe_ids)
  const lovedSet = new Set(tasteProfile.loved_recipe_ids)
  if (dislikedSet.size > 0) {
    for (const mt of Object.keys(recipesByMealType) as MealType[]) {
      recipesByMealType[mt] = recipesByMealType[mt].filter((r) => !dislikedSet.has(r.id))
    }
  }

  const totalRecipes = Object.values(recipesByMealType).reduce((n, r) => n + r.length, 0)
  logger.info({ userId: user.id, totalRecipes, cooldownDays, mealTypes: active_meal_types }, 'suggest: recipes after cooldown filter')
  if (totalRecipes === 0) {
    logger.warn({ userId: user.id, cooldownDays }, 'suggest: 0 recipes available — cooldown may be excluding all recipes')
  }

  const today = new Date()
  const season = getSeason(today.getMonth())

  const systemMessage = buildSystemMessage(prefs, prefer_this_week ?? [], avoid_this_week ?? [], season, tasteProfile)
  const pantryContext = await fetchPantryContext(db, user.id, ctx)
  const userMessage = buildFullWeekUserMessage(
    active_dates,
    recipesByMealType,
    recentHistory,
    free_text ?? '',
    active_meal_types,
    pantryContext,
    lovedSet,
  )

  const validIdsByMealType = new Map<MealType, Set<string>>()
  for (const [mt, recipes] of Object.entries(recipesByMealType) as [MealType, typeof recipesByMealType[MealType]][]) {
    validIdsByMealType.set(mt, new Set(recipes.map((r) => r.id)))
  }

  try {
    const raw = await callLLMNonStreaming(systemMessage, userMessage)
    logger.debug({ responseLength: raw.length, preview: raw.slice(0, 200) }, 'suggest: LLM response received')
    const parsed = parseLLMJsonSafe<{ days: DaySuggestions[] }>(raw)
    if (!parsed || !Array.isArray(parsed.days)) {
      logger.error({ responsePreview: raw.slice(0, 500) }, 'suggest: invalid LLM response structure')
      return NextResponse.json({ error: 'Suggestion failed. Please try again.' }, { status: 500 })
    }
    const validated = validateSuggestions(parsed.days, validIdsByMealType)

    // ── Step 1: Fetch next week's saved plan ──────────────────────────────────
    let nextWeekRecipes: RecipeForOverlap[] = []

    if (body.include_next_week_plan) {
      const nextWeekDate = new Date(week_start)
      nextWeekDate.setDate(nextWeekDate.getDate() + 7)
      const nextWeekStart = nextWeekDate.toISOString().slice(0, 10)

      let nextPlanQ = db.from('meal_plans').select('id').eq('week_start', nextWeekStart)
      nextPlanQ = scopeQuery(nextPlanQ, user.id, ctx)
      const { data: nextPlan } = await nextPlanQ.maybeSingle()

      if (nextPlan?.id) {
        const { data: entries } = await db
          .from('meal_plan_entries')
          .select('recipe_id, recipes(title, ingredients)')
          .eq('meal_plan_id', nextPlan.id)

        nextWeekRecipes = (entries ?? [])
          .map((e) => {
            const r = e.recipes as { title: string; ingredients: string | null } | null
            return {
              recipe_id:   e.recipe_id,
              title:       r?.title ?? '',
              ingredients: r?.ingredients ?? '',
            }
          })
          .filter((r) => r.ingredients.trim() !== '')
      }
    }

    // ── Step 2: Fetch ingredients for this week's suggestions ─────────────────
    const suggestedIds = new Set<string>()
    for (const day of validated) {
      for (const mts of day.meal_types) {
        for (const opt of mts.options) {
          suggestedIds.add(opt.recipe_id)
        }
      }
    }

    const { data: thisWeekData } = await db
      .from('recipes')
      .select('id, title, ingredients')
      .in('id', [...suggestedIds])

    const thisWeekRecipes: RecipeForOverlap[] = (thisWeekData ?? [])
      .filter((r) => r.ingredients)
      .map((r) => ({
        recipe_id:   r.id,
        title:       r.title,
        ingredients: r.ingredients!,
      }))

    // ── Step 3: Run overlap detection with timeout ────────────────────────────
    let wasteMap: Map<string, WasteMatch[]> | null = null

    if (thisWeekRecipes.length > 0) {
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), WASTE_DETECTION_TIMEOUT_MS),
      )

      wasteMap = await Promise.race([
        detectWasteOverlap(thisWeekRecipes, nextWeekRecipes, callLLM).catch(() => null),
        timeoutPromise,
      ])
    }

    // ── Step 4: Re-rank and attach badge text ─────────────────────────────────
    if (wasteMap) {
      for (const day of validated) {
        for (const mts of day.meal_types) {
          for (const opt of mts.options) {
            const matches = wasteMap.get(opt.recipe_id)
            if (matches?.length) {
              opt.waste_matches    = matches
              opt.waste_badge_text = getPrimaryWasteBadgeText(matches)
            }
          }

          mts.options.sort((a, b) => {
            const scoreA = a.waste_matches?.length ?? 0
            const scoreB = b.waste_matches?.length ?? 0
            return scoreB - scoreA
          })
        }
      }
    }

    return NextResponse.json({ days: validated })
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'suggest: LLM call failed')
    return NextResponse.json({ error: 'Suggestion failed. Please try again.' }, { status: 500 })
  }
})
