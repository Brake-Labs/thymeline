import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { suggestSchema, parseBody } from '@/lib/schemas'
import { addDays } from '@/lib/date-utils'
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
import { db } from '@/lib/db'
import { eq, and, gte, inArray } from 'drizzle-orm'
import { mealPlans, mealPlanEntries, recipes } from '@/lib/db/schema'
import { scopeCondition } from '@/lib/household'
import { dbFirst } from '@/lib/db/helpers'
import { deriveTasteProfile } from '@/lib/taste-profile'
import { detectWasteOverlap, getPrimaryWasteBadgeText, type RecipeForOverlap } from '@/lib/waste-overlap'
import type { DaySuggestions, MealType, WasteMatch } from '@/types'

const WASTE_DETECTION_TIMEOUT_MS = 8000

export const POST = withAuth(async (req: NextRequest, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, suggestSchema)
  if (parseError) return parseError

  const { weekStart, activeDates, preferThisWeek, avoidThisWeek, freeText } = body
  const activeMealTypes: MealType[] = body.activeMealTypes?.length ? body.activeMealTypes : ['dinner']

  const [prefs, tasteProfile] = await Promise.all([
    fetchUserPreferences(user.id, ctx),
    deriveTasteProfile(user.id, null, ctx ?? null),
  ])
  const cooldownDays = prefs?.cooldownDays ?? 28
  const recipesByMealType = await fetchRecipesByMealTypes(user.id, cooldownDays, activeMealTypes, ctx)
  const recentHistory = await fetchRecentHistory(user.id)

  // Exclude recipes already planned within the cooldown window (past or future).
  // Using the planning weekStart as the anchor: any recipe whose plannedDate
  // falls within cooldownDays before weekStart up to the end of that week is
  // treated as "recently planned" and excluded — matching the same logic that
  // recipe_history uses for "recently made".
  const alreadyPlannedIds = new Set<string>()
  const cooldownCutoff = addDays(weekStart, -cooldownDays)

  const allPlanRows = await db
    .select({ id: mealPlans.id, weekStart: mealPlans.weekStart })
    .from(mealPlans)
    .where(scopeCondition(
      { userId: mealPlans.userId, householdId: mealPlans.householdId },
      user.id,
      ctx,
    ))

  for (const plan of allPlanRows) {
    const entryRows = await db
      .select({ recipeId: mealPlanEntries.recipeId })
      .from(mealPlanEntries)
      .where(and(
        eq(mealPlanEntries.mealPlanId, plan.id),
        gte(mealPlanEntries.plannedDate, cooldownCutoff),
      ))

    for (const entry of entryRows) {
      alreadyPlannedIds.add(entry.recipeId)
    }
  }

  if (alreadyPlannedIds.size > 0) {
    for (const mt of Object.keys(recipesByMealType) as MealType[]) {
      recipesByMealType[mt] = recipesByMealType[mt].filter((r) => !alreadyPlannedIds.has(r.id))
    }
  }

  // Filter out disliked recipes; build loved set for prompt annotations
  const dislikedSet = new Set(tasteProfile.dislikedRecipeIds)
  const lovedSet = new Set(tasteProfile.lovedRecipeIds)
  if (dislikedSet.size > 0) {
    for (const mt of Object.keys(recipesByMealType) as MealType[]) {
      recipesByMealType[mt] = recipesByMealType[mt].filter((r) => !dislikedSet.has(r.id))
    }
  }

  const totalRecipes = Object.values(recipesByMealType).reduce((n, r) => n + r.length, 0)
  console.warn(`[suggest] user=${user.id} total_recipes_after_cooldown=${totalRecipes} cooldownDays=${cooldownDays}`)
  if (totalRecipes === 0) {
    console.warn(`[suggest] 0 recipes available — cooldown may be excluding all recipes`)
  }

  const today = new Date()
  const season = getSeason(today.getMonth())

  const systemMessage = buildSystemMessage(prefs, preferThisWeek ?? [], avoidThisWeek ?? [], season, tasteProfile)
  const pantryContext = await fetchPantryContext(user.id, ctx)
  const userMessage = buildFullWeekUserMessage(
    activeDates,
    recipesByMealType,
    recentHistory,
    freeText ?? '',
    activeMealTypes,
    pantryContext,
    lovedSet,
  )

  const validIdsByMealType = new Map<MealType, Set<string>>()
  for (const [mt, recs] of Object.entries(recipesByMealType) as [MealType, typeof recipesByMealType[MealType]][]) {
    validIdsByMealType.set(mt, new Set(recs.map((r) => r.id)))
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

    // ── Step 1: Fetch next week's saved plan ──────────────────────────────────
    let nextWeekRecipes: RecipeForOverlap[] = []

    if (body.includeNextWeekPlan) {
      const nextWeekDate = new Date(weekStart)
      nextWeekDate.setDate(nextWeekDate.getDate() + 7)
      const nextWeekStart = nextWeekDate.toISOString().slice(0, 10)

      const nextPlanRows = await db
        .select({ id: mealPlans.id })
        .from(mealPlans)
        .where(and(
          eq(mealPlans.weekStart, nextWeekStart),
          scopeCondition({ userId: mealPlans.userId, householdId: mealPlans.householdId }, user.id, ctx),
        ))
        .limit(1)

      const nextPlan = dbFirst(nextPlanRows)

      if (nextPlan?.id) {
        const entryRows = await db
          .select({
            recipeId: mealPlanEntries.recipeId,
            recipeTitle: recipes.title,
            recipeIngredients: recipes.ingredients,
          })
          .from(mealPlanEntries)
          .innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
          .where(eq(mealPlanEntries.mealPlanId, nextPlan.id))

        nextWeekRecipes = entryRows
          .map((e) => ({
            recipeId:   e.recipeId,
            title:       e.recipeTitle ?? '',
            ingredients: e.recipeIngredients ?? '',
          }))
          .filter((r) => r.ingredients.trim() !== '')
      }
    }

    // ── Step 2: Fetch ingredients for this week's suggestions ─────────────────
    const suggestedIds = new Set<string>()
    for (const day of validated) {
      for (const mts of day.mealTypes) {
        for (const opt of mts.options) {
          suggestedIds.add(opt.recipeId)
        }
      }
    }

    const thisWeekData = suggestedIds.size > 0
      ? await db
          .select({ id: recipes.id, title: recipes.title, ingredients: recipes.ingredients })
          .from(recipes)
          .where(inArray(recipes.id, [...suggestedIds]))
      : []

    const thisWeekRecipes: RecipeForOverlap[] = thisWeekData
      .filter((r) => r.ingredients)
      .map((r) => ({
        recipeId:   r.id,
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
        for (const mts of day.mealTypes) {
          for (const opt of mts.options) {
            const matches = wasteMap.get(opt.recipeId)
            if (matches?.length) {
              opt.wasteMatches    = matches
              opt.wasteBadgeText = getPrimaryWasteBadgeText(matches)
            }
          }

          mts.options.sort((a, b) => {
            const scoreA = a.wasteMatches?.length ?? 0
            const scoreB = b.wasteMatches?.length ?? 0
            return scoreB - scoreA
          })
        }
      }
    }

    return NextResponse.json({ days: validated })
  } catch (err) {
    console.error('LLM suggest error:', err)
    return NextResponse.json({ error: 'Suggestion failed. Please try again.' }, { status: 500 })
  }
})
