// server-only — do not import from client components
import { eq, and } from 'drizzle-orm'
import { getMostRecentSunday } from '@/lib/date-utils'
import { db } from '@/lib/db'
import { mealPlans, mealPlanEntries, recipes } from '@/lib/db/schema'
import { scopeCondition } from '@/lib/household'
import type { HouseholdContext, WasteMatch } from '@/types'
import type { RecipeForOverlap } from '@/lib/waste-overlap'

export async function fetchCurrentWeekPlan(
  userId: string,
  _db: unknown,
  ctx: HouseholdContext | null,
): Promise<RecipeForOverlap[]> {
  const weekStart = getMostRecentSunday()

  const planRows = await db
    .select({ id: mealPlans.id })
    .from(mealPlans)
    .where(and(
      eq(mealPlans.weekStart, weekStart),
      scopeCondition({ userId: mealPlans.userId, householdId: mealPlans.householdId }, userId, ctx),
    ))
    .limit(1)

  const plan = planRows[0]
  if (!plan?.id) return []

  const entries = await db
    .select({
      recipeId: mealPlanEntries.recipeId,
      title: recipes.title,
      ingredients: recipes.ingredients,
    })
    .from(mealPlanEntries)
    .innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
    .where(eq(mealPlanEntries.mealPlanId, plan.id))

  return entries
    .map((e) => ({
      recipe_id:   e.recipeId,
      title:       e.title ?? '',
      ingredients: e.ingredients ?? '',
    }))
    .filter((r) => r.ingredients.trim() !== '')
}

export function getPlanWasteBadgeText(
  matches: Pick<WasteMatch, 'ingredient' | 'waste_risk'>[],
): string {
  if (!matches.length) return ''
  if (matches.length >= 2) return `Uses up ${matches.length} ingredients`
  return `Uses up your ${matches[0]!.ingredient}`
}
