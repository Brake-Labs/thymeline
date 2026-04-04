// server-only — do not import from client components
import { getMostRecentSunday } from '@/lib/date-utils'
import { scopeQuery } from '@/lib/household'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { HouseholdContext, WasteMatch } from '@/types'
import type { RecipeForOverlap } from '@/lib/waste-overlap'

export async function fetchCurrentWeekPlan(
  userId: string,
  db: SupabaseClient<Database>,
  ctx: HouseholdContext | null,
): Promise<RecipeForOverlap[]> {
  const weekStart = getMostRecentSunday()

  let planQ = db.from('meal_plans').select('id').eq('week_start', weekStart)
  planQ = scopeQuery(planQ, userId, ctx)
  const { data: plan } = await planQ.maybeSingle()

  if (!plan?.id) return []

  const { data: entries } = await db
    .from('meal_plan_entries')
    .select('recipe_id, recipes(title, ingredients)')
    .eq('meal_plan_id', plan.id)

  return (entries ?? [])
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

export function getPlanWasteBadgeText(
  matches: Pick<WasteMatch, 'ingredient' | 'waste_risk'>[],
): string {
  if (!matches.length) return ''
  if (matches.length >= 2) return `Uses up ${matches.length} ingredients`
  return `Uses up your ${matches[0]!.ingredient}`
}
