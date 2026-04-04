import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { TasteProfile, CookingFrequency, HouseholdContext } from '@/types'
import { scopeQuery } from '@/lib/household'

export const IMPLICIT_LOVE_THRESHOLD = 3   // configurable constant per brief

export async function deriveTasteProfile(
  userId: string,
  db: SupabaseClient<Database>,
  ctx: HouseholdContext | null,
): Promise<TasteProfile> {
  // Resolve member IDs for the history queries
  let memberIds: string[] = [userId]
  if (ctx) {
    const { data: members } = await db
      .from('household_members')
      .select('user_id')
      .eq('household_id', ctx.householdId)
    memberIds = members?.map((m) => m.user_id) ?? [userId]
  }

  // Date thresholds
  const today = new Date()
  const ago30  = new Date(today); ago30.setDate(today.getDate() - 30)
  const ago90  = new Date(today); ago90.setDate(today.getDate() - 90)
  const ago180 = new Date(today); ago180.setDate(today.getDate() - 180)
  const sixMonthsAgo = ago180.toISOString().slice(0, 10)
  const ago30Str  = ago30.toISOString().slice(0, 10)
  const ago90Str  = ago90.toISOString().slice(0, 10)

  // Fetch user preferences for avoided_tags, preferred_tags, meal_context
  let prefsQ = db.from('user_preferences').select('avoided_tags, preferred_tags, meal_context')
  prefsQ = scopeQuery(prefsQ, userId, ctx)
  const { data: prefs } = await prefsQ.maybeSingle()

  // ── loved_recipe_ids ───────────────────────────────────────────────────────

  // Explicit: make_again = true (any member)
  const { data: explicitLoved } = await db
    .from('recipe_history')
    .select('recipe_id')
    .in('user_id', memberIds)
    .eq('make_again', true)

  // Implicit: made >= IMPLICIT_LOVE_THRESHOLD times in last 6 months
  const { data: recentHistory } = await db
    .from('recipe_history')
    .select('recipe_id, made_on')
    .in('user_id', memberIds)
    .gte('made_on', sixMonthsAgo)

  const countMap = new Map<string, number>()
  for (const entry of recentHistory ?? []) {
    countMap.set(entry.recipe_id, (countMap.get(entry.recipe_id) ?? 0) + 1)
  }
  const implicitLoved = [...countMap.entries()]
    .filter(([, n]) => n >= IMPLICIT_LOVE_THRESHOLD)
    .map(([id]) => id)

  const lovedSet = new Set([
    ...(explicitLoved ?? []).map((r) => r.recipe_id),
    ...implicitLoved,
  ])
  const loved_recipe_ids = [...lovedSet]

  // ── disliked_recipe_ids ────────────────────────────────────────────────────

  const { data: disliked } = await db
    .from('recipe_history')
    .select('recipe_id')
    .in('user_id', memberIds)
    .eq('make_again', false)

  const disliked_recipe_ids = [...new Set((disliked ?? []).map((r) => r.recipe_id))]

  // ── top_tags ───────────────────────────────────────────────────────────────

  const { data: tagHistory } = await db
    .from('recipe_history')
    .select('made_on, recipes(tags)')
    .in('user_id', memberIds)
    .gte('made_on', sixMonthsAgo)

  const tagWeights = new Map<string, number>()

  for (const entry of tagHistory ?? []) {
    const weight = entry.made_on >= ago30Str ? 3
                 : entry.made_on >= ago90Str ? 2
                 : 1
    for (const tag of (entry.recipes?.tags as string[] | null) ?? []) {
      tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + weight)
    }
  }

  // Remove avoided tags and return top 10
  const avoided = (prefs?.avoided_tags as string[] | null) ?? []
  const top_tags = [...tagWeights.entries()]
    .filter(([tag]) => !avoided.includes(tag))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag)

  // ── cooking_frequency ──────────────────────────────────────────────────────

  const { data: recent30 } = await db
    .from('recipe_history')
    .select('recipe_id')
    .in('user_id', memberIds)
    .gte('made_on', ago30.toISOString().slice(0, 10))

  const distinctCount = new Set((recent30 ?? []).map((r) => r.recipe_id)).size
  const cooking_frequency: CookingFrequency =
    distinctCount <= 2 ? 'light'
    : distinctCount <= 6 ? 'moderate'
    : 'frequent'

  // ── recent_recipes ─────────────────────────────────────────────────────────

  const { data: recent } = await db
    .from('recipe_history')
    .select('recipe_id, made_on, recipes(title)')
    .in('user_id', memberIds)
    .order('made_on', { ascending: false })
    .limit(10)

  const recent_recipes = (recent ?? []).map((r) => ({
    recipe_id: r.recipe_id,
    title:     (r.recipes as { title: string } | null)?.title ?? '',
    made_on:   r.made_on,
  }))

  return {
    loved_recipe_ids,
    disliked_recipe_ids,
    top_tags,
    avoided_tags:    avoided,
    preferred_tags:  (prefs?.preferred_tags as string[] | null) ?? [],
    meal_context:    (prefs?.meal_context as string | null) ?? null,
    cooking_frequency,
    recent_recipes,
  }
}
