import { type SupabaseClient } from '@supabase/supabase-js'
import { callLLM } from '@/lib/llm'
import type { UserPreferences, LimitedTag, MealType, DaySuggestions, HouseholdContext, RecipeJoinResult } from '@/types'

export const MEAL_TYPE_CATEGORIES: Record<MealType, string[]> = {
  breakfast: ['breakfast'],
  lunch:     ['main_dish'],
  dinner:    ['main_dish'],
  snack:     ['side_dish'],
  dessert:   ['dessert'],
}

// ── Week helpers ───────────────────────────────────────────────────────────────

export { getMostRecentSunday, isSunday } from '@/lib/date-utils'

// ── Season helpers ─────────────────────────────────────────────────────────────

export function getSeason(month: number): 'spring' | 'summer' | 'autumn' | 'winter' {
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

// ── Recipe + preference fetching ───────────────────────────────────────────────

export interface RecipeForLLM {
  id: string
  title: string
  tags: string[]
}

export async function fetchCooldownFilteredRecipes(
  supabase: SupabaseClient,
  userId: string,
  cooldownDays: number,
  categories?: string[],
  ctx?: HouseholdContext | null,
): Promise<RecipeForLLM[]> {
  const cats = categories ?? ['main_dish']
  // Fetch recipes scoped by household or user
  let recipesQ = supabase
    .from('recipes')
    .select('id, title, tags')
    .in('category', cats)
  if (ctx) {
    recipesQ = recipesQ.eq('household_id', ctx.householdId)
  } else {
    recipesQ = recipesQ.eq('user_id', userId)
  }

  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - cooldownDays)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  // Parallelize recipe fetch and history fetch — they are independent
  const [{ data: recipes }, { data: history }] = await Promise.all([
    recipesQ,
    supabase
      .from('recipe_history')
      .select('recipe_id, made_on')
      .eq('user_id', userId)
      .gte('made_on', cutoffStr),
  ])

  if (!recipes || recipes.length === 0) return []

  const recentlyMadeIds = new Set((history ?? []).map((h: { recipe_id: string }) => h.recipe_id))

  return recipes.filter((r: RecipeForLLM) => !recentlyMadeIds.has(r.id))
}

export async function fetchRecipesByMealTypes(
  supabase: SupabaseClient,
  userId: string,
  cooldownDays: number,
  mealTypes: MealType[],
  ctx?: HouseholdContext | null,
): Promise<Record<MealType, RecipeForLLM[]>> {
  // Compute the cooldown cutoff once
  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - cooldownDays)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  // Fetch history ONCE (shared across all meal types) in parallel with all recipe queries
  const historyPromise = supabase
    .from('recipe_history')
    .select('recipe_id, made_on')
    .eq('user_id', userId)
    .gte('made_on', cutoffStr)

  const recipePromises = mealTypes.map((mt) => {
    const cats = MEAL_TYPE_CATEGORIES[mt]
    let q = supabase
      .from('recipes')
      .select('id, title, tags')
      .in('category', cats)
    if (ctx) {
      q = q.eq('household_id', ctx.householdId)
    } else {
      q = q.eq('user_id', userId)
    }
    return q
  })

  // Fire all queries in parallel: one history + N recipe queries
  const [{ data: history }, ...recipeResults] = await Promise.all([
    historyPromise,
    ...recipePromises,
  ])

  const recentlyMadeIds = new Set((history ?? []).map((h: { recipe_id: string }) => h.recipe_id))

  const result = {} as Record<MealType, RecipeForLLM[]>
  mealTypes.forEach((mt, i) => {
    const recipes = recipeResults[i]?.data ?? []
    result[mt] = (recipes as RecipeForLLM[]).filter((r) => !recentlyMadeIds.has(r.id))
  })
  return result
}

export async function fetchRecentHistory(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ title: string; made_on: string }[]> {
  const { data } = await supabase
    .from('recipe_history')
    .select('made_on, recipes(title)')
    .eq('user_id', userId)
    .order('made_on', { ascending: false })
    .limit(10)

  return (data ?? []).map((h: { made_on: string; recipes: unknown }) => ({
    title: (h.recipes as unknown as RecipeJoinResult | null)?.title ?? '',
    made_on: h.made_on,
  }))
}

export async function fetchUserPreferences(
  supabase: SupabaseClient,
  userId: string,
  ctx?: HouseholdContext | null,
): Promise<UserPreferences | null> {
  let q = supabase.from('user_preferences').select('*')
  if (ctx) {
    q = q.eq('household_id', ctx.householdId)
  } else {
    q = q.eq('user_id', userId)
  }
  const { data } = await q.single()
  return data as UserPreferences | null
}

// ── Prompt construction ─────────────────────────────────────────────────────────

function buildAvoidedTags(prefs: UserPreferences | null, sessionAvoid: string[]): string {
  const combined = Array.from(new Set([...(prefs?.avoided_tags ?? []), ...sessionAvoid]))
  return combined.length ? combined.join(', ') : 'none'
}

function buildPreferredTags(prefs: UserPreferences | null, sessionPrefer: string[]): string {
  const combined = Array.from(new Set([...(prefs?.preferred_tags ?? []), ...sessionPrefer]))
  return combined.length ? combined.join(', ') : 'none'
}

function buildLimitedTagsSummary(limitedTags: LimitedTag[]): string {
  if (!limitedTags.length) return 'none'
  return limitedTags.map((lt) => `${lt.tag}: max ${lt.cap}/week`).join(', ')
}

function buildSeasonalInstructions(
  prefs: UserPreferences | null,
  season: 'spring' | 'summer' | 'autumn' | 'winter',
): string {
  if (!prefs?.seasonal_mode) return ''
  const rules = (prefs.seasonal_rules as Record<string, { favor?: string[]; cap?: Record<string, number>; exclude?: string[] }> | null)?.[season]
  if (!rules) return ''
  const parts: string[] = []
  if (rules.favor?.length) parts.push(`Favor ${rules.favor.join(', ')} recipes.`)
  if (rules.cap) {
    Object.entries(rules.cap).forEach(([tag, cap]) => parts.push(`Cap ${tag} at ${cap} total across the week.`))
  }
  if (rules.exclude?.length) parts.push(`Exclude ${rules.exclude.join(', ')} recipes.`)
  return parts.join(' ')
}

export function buildSystemMessage(
  prefs: UserPreferences | null,
  sessionPrefer: string[],
  sessionAvoid: string[],
  season: 'spring' | 'summer' | 'autumn' | 'winter',
): string {
  const optionsPerDay = prefs?.options_per_day ?? 3
  const avoided = buildAvoidedTags(prefs, sessionAvoid)
  const preferred = buildPreferredTags(prefs, sessionPrefer)
  const limited = buildLimitedTagsSummary(prefs?.limited_tags ?? [])
  const seasonal = buildSeasonalInstructions(prefs, season)

  return `You are a meal planning assistant. You will be given a list of recipes and user preferences, and you must suggest meals for specific days of the week.

Rules you must follow exactly:
- Only suggest recipes from the provided recipe list. Never invent recipes.
- Only use recipe_ids from the provided list. Never guess or modify ids.
- Return exactly ${optionsPerDay} options per day.
- Never suggest the same recipe for more than one day.
- Never suggest recipes with avoided tags: ${avoided}.
- Prefer recipes with preferred tags: ${preferred}.
- Respect weekly tag caps: ${limited}.
  e.g. if "Comfort" cap is 2, the total options across all days with the "Comfort" tag must not exceed 2.
- Current season is ${season}.${seasonal ? ' ' + seasonal : ''}
- Variety matters: spread different recipe types across the week.

Return ONLY valid JSON in this exact format, with no prose, no markdown:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "meal_types": [
        {
          "meal_type": "dinner",
          "options": [
            {
              "recipe_id": "uuid",
              "recipe_title": "Recipe Name",
              "reason": "One-line reason, e.g. Quick weeknight option"
            }
          ]
        }
      ]
    }
  ]
}`
}

export async function fetchPantryContext(
  supabase: SupabaseClient,
  userId: string,
  ctx?: HouseholdContext | null,
): Promise<string> {
  try {
    let q = supabase
      .from('pantry_items')
      .select('name, expiry_date')
    if (ctx) {
      q = q.eq('household_id', ctx.householdId)
    } else {
      q = q.eq('user_id', userId)
    }
    const { data: items } = await q
      .order('expiry_date', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })
      .limit(30)

    if (!items?.length) return ''

    const lines = (items as { name: string; expiry_date: string | null }[]).map((item) => {
      const expiry = item.expiry_date ? ` (expires ${item.expiry_date})` : ''
      return `- ${item.name}${expiry}`
    })

    return `Pantry items on hand (bias suggestions toward recipes using these, especially items expiring soon):\n${lines.join('\n')}`
  } catch {
    return ''
  }
}

export function buildFullWeekUserMessage(
  activeDates: string[],
  recipesByMealType: Record<MealType, RecipeForLLM[]>,
  recentHistory: { title: string; made_on: string }[],
  freeText: string,
  specificRequests: string,
  activeMealTypes: MealType[],
  pantryContext: string = '',
): string {
  const recipesSection = activeMealTypes.map((mt) => {
    const list = (recipesByMealType[mt] ?? []).map((r) => ({ recipe_id: r.id, title: r.title, tags: r.tags }))
    return `${mt}: ${JSON.stringify(list)}`
  }).join('\n')

  return `Plan meals for these dates: ${activeDates.join(', ')}
Meal types to plan: ${activeMealTypes.join(', ')}

Available recipes by meal type (cooldown-filtered):
${recipesSection}

Recent meal history (avoid repeating recent meals):
${JSON.stringify(recentHistory)}

User context for this week:
${freeText || '(none)'}

Specific requests (best-effort):
${specificRequests || '(none)'}

Pantry context:
${pantryContext || '(none)'}`
}

export function buildSwapUserMessage(
  date: string,
  mealType: MealType,
  recipes: RecipeForLLM[],
  recentHistory: { title: string; made_on: string }[],
  alreadySelected: { date: string; recipe_id: string }[],
  freeText: string,
  allRecipes: RecipeForLLM[],
  pantryContext: string = '',
): string {
  const selectedTitles = alreadySelected
    .map((s) => allRecipes.find((r) => r.id === s.recipe_id)?.title ?? s.recipe_id)
    .filter(Boolean)
    .join(', ')

  const recipesForPrompt = recipes.map((r) => ({ recipe_id: r.id, title: r.title, tags: r.tags }))
  return `Plan meals for these dates: ${date}
Meal type: ${mealType}

Available recipes (cooldown-filtered):
${JSON.stringify(recipesForPrompt)}

Recent meal history (avoid repeating recent meals):
${JSON.stringify(recentHistory)}

Recipes already selected for other days (do not repeat these): ${selectedTitles || 'none'}

User context for this week:
${freeText || '(none)'}

Pantry context:
${pantryContext || '(none)'}

Return suggestions for ${date} / ${mealType} only.`
}

// ── LLM call + validation ──────────────────────────────────────────────────────

export function validateSuggestions(
  days: DaySuggestions[],
  validIdsByMealType: Map<MealType, Set<string>>,
): DaySuggestions[] {
  return days.map((day) => ({
    date: day.date,
    meal_types: (day.meal_types ?? []).map((mts) => ({
      meal_type: mts.meal_type,
      options: mts.options.filter((opt) => {
        const ids = validIdsByMealType.get(mts.meal_type)
        return ids ? ids.has(opt.recipe_id) : false
      }),
    })),
  }))
}

export async function callLLMNonStreaming(
  systemMessage: string,
  userMessage: string,
): Promise<string> {
  return callLLM({
    system: systemMessage,
    user: userMessage,
    maxTokens: 4096,
  })
}
