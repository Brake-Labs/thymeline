import { eq, and, inArray, gte, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { recipeHistory, recipes, userPreferences, householdMembers } from '@/lib/db/schema'
import { scopeCondition } from '@/lib/household'
import type { TasteProfile, CookingFrequency, HouseholdContext } from '@/types'

export const IMPLICIT_LOVE_THRESHOLD = 3   // configurable constant per brief

export async function deriveTasteProfile(
  userId: string,
  _db: unknown,
  ctx: HouseholdContext | null,
): Promise<TasteProfile> {
  // Resolve member IDs for the history queries
  let memberIds: string[] = [userId]
  if (ctx) {
    const members = await db
      .select({ userId: householdMembers.userId })
      .from(householdMembers)
      .where(eq(householdMembers.householdId, ctx.householdId))
    memberIds = members.map((m) => m.userId)
    if (memberIds.length === 0) memberIds = [userId]
  }

  // Date thresholds
  const today = new Date()
  const ago30  = new Date(today); ago30.setDate(today.getDate() - 30)
  const ago90  = new Date(today); ago90.setDate(today.getDate() - 90)
  const ago180 = new Date(today); ago180.setDate(today.getDate() - 180)
  const sixMonthsAgo = ago180.toISOString().slice(0, 10)
  const ago30Str  = ago30.toISOString().slice(0, 10)
  const ago90Str  = ago90.toISOString().slice(0, 10)

  // Fetch user preferences
  const prefsRows = await db
    .select({
      avoidedTags: userPreferences.avoidedTags,
      preferredTags: userPreferences.preferredTags,
      mealContext: userPreferences.mealContext,
    })
    .from(userPreferences)
    .where(scopeCondition({ userId: userPreferences.userId, householdId: userPreferences.householdId }, userId, ctx))
    .limit(1)
  const prefs = prefsRows[0] ?? null

  // ── loved_recipe_ids ───────────────────────────────────────────────────────

  // Explicit: make_again = true (any member)
  const explicitLoved = await db
    .select({ recipeId: recipeHistory.recipeId })
    .from(recipeHistory)
    .where(and(inArray(recipeHistory.userId, memberIds), eq(recipeHistory.makeAgain, true)))

  // Implicit: made >= IMPLICIT_LOVE_THRESHOLD times in last 6 months
  const recentHistoryRows = await db
    .select({ recipeId: recipeHistory.recipeId, madeOn: recipeHistory.madeOn })
    .from(recipeHistory)
    .where(and(inArray(recipeHistory.userId, memberIds), gte(recipeHistory.madeOn, sixMonthsAgo)))

  const countMap = new Map<string, number>()
  for (const entry of recentHistoryRows) {
    countMap.set(entry.recipeId, (countMap.get(entry.recipeId) ?? 0) + 1)
  }
  const implicitLoved = [...countMap.entries()]
    .filter(([, n]) => n >= IMPLICIT_LOVE_THRESHOLD)
    .map(([id]) => id)

  const lovedSet = new Set([
    ...explicitLoved.map((r) => r.recipeId),
    ...implicitLoved,
  ])
  const loved_recipe_ids = [...lovedSet]

  // ── disliked_recipe_ids ────────────────────────────────────────────────────

  const disliked = await db
    .select({ recipeId: recipeHistory.recipeId })
    .from(recipeHistory)
    .where(and(inArray(recipeHistory.userId, memberIds), eq(recipeHistory.makeAgain, false)))

  const disliked_recipe_ids = [...new Set(disliked.map((r) => r.recipeId))]

  // ── top_tags ───────────────────────────────────────────────────────────────

  const tagHistory = await db
    .select({
      madeOn: recipeHistory.madeOn,
      tags: recipes.tags,
    })
    .from(recipeHistory)
    .innerJoin(recipes, eq(recipeHistory.recipeId, recipes.id))
    .where(and(inArray(recipeHistory.userId, memberIds), gte(recipeHistory.madeOn, sixMonthsAgo)))

  const tagWeights = new Map<string, number>()

  for (const entry of tagHistory) {
    const weight = entry.madeOn >= ago30Str ? 3
                 : entry.madeOn >= ago90Str ? 2
                 : 1
    for (const tag of entry.tags ?? []) {
      tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + weight)
    }
  }

  // Remove avoided tags and return top 10
  const avoided = prefs?.avoidedTags ?? []
  const top_tags = [...tagWeights.entries()]
    .filter(([tag]) => !avoided.includes(tag))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag)

  // ── cooking_frequency ──────────────────────────────────────────────────────

  const recent30 = await db
    .select({ recipeId: recipeHistory.recipeId })
    .from(recipeHistory)
    .where(and(inArray(recipeHistory.userId, memberIds), gte(recipeHistory.madeOn, ago30.toISOString().slice(0, 10))))

  const distinctCount = new Set(recent30.map((r) => r.recipeId)).size
  const cooking_frequency: CookingFrequency =
    distinctCount <= 2 ? 'light'
    : distinctCount <= 6 ? 'moderate'
    : 'frequent'

  // ── recent_recipes ─────────────────────────────────────────────────────────

  const recent = await db
    .select({
      recipeId: recipeHistory.recipeId,
      madeOn: recipeHistory.madeOn,
      title: recipes.title,
    })
    .from(recipeHistory)
    .innerJoin(recipes, eq(recipeHistory.recipeId, recipes.id))
    .where(inArray(recipeHistory.userId, memberIds))
    .orderBy(desc(recipeHistory.madeOn))
    .limit(10)

  const recent_recipes = recent.map((r) => ({
    recipe_id: r.recipeId,
    title:     r.title ?? '',
    made_on:   r.madeOn,
  }))

  return {
    loved_recipe_ids,
    disliked_recipe_ids,
    top_tags,
    avoided_tags:    avoided,
    preferred_tags:  prefs?.preferredTags ?? [],
    meal_context:    prefs?.mealContext ?? null,
    cooking_frequency,
    recent_recipes,
  }
}
