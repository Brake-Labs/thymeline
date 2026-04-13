import { db } from '@/lib/db'
import { eq, and, inArray, gte, desc, asc } from 'drizzle-orm'
import { recipes, recipeHistory, mealPlans, userPreferences, pantryItems } from '@/lib/db/schema'
import { dbFirst } from '@/lib/db/helpers'
import { scopeCondition, scopeInsert } from '@/lib/household'
import { callLLM } from '@/lib/llm'
import { toDateString } from '@/lib/date-utils'
import type { UserPreferences, LimitedTag, MealType, DaySuggestions, HouseholdContext, TasteProfile } from '@/types'

export const MEAL_TYPE_CATEGORIES: Record<MealType, string[]> = {
  breakfast: ['breakfast'],
  lunch:     ['main_dish'],
  dinner:    ['main_dish'],
  snack:     ['side_dish'],
  dessert:   ['dessert'],
}

// ── Week helpers ───────────────────────────────────────────────────────────────

export { getMostRecentSunday, isSunday } from '@/lib/date-utils'

// ── Meal plan helpers ─────────────────────────────────────────────────────────

/**
 * Find an existing meal plan for the given week, or create a new one.
 * Returns the plan ID, or an error string if creation failed.
 */
export async function getOrCreateMealPlan(
  userId: string,
  weekStart: string,
  ctx?: HouseholdContext | null,
): Promise<{ planId: string } | { error: string }> {
  try {
    const existing = await db
      .select({ id: mealPlans.id })
      .from(mealPlans)
      .where(and(
        eq(mealPlans.weekStart, weekStart),
        scopeCondition({ userId: mealPlans.userId, householdId: mealPlans.householdId }, userId, ctx ?? null),
      ))
      .limit(1)

    const row = dbFirst(existing)
    if (row?.id) return { planId: row.id }

    const insertPayload = { ...scopeInsert(userId, ctx ?? null), weekStart }
    const [created] = await db.insert(mealPlans).values(insertPayload).returning({ id: mealPlans.id })
    if (!created) return { error: 'unknown' }
    return { planId: created.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'unknown' }
  }
}

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
  userId: string,
  cooldownDays: number,
  categories?: string[],
  ctx?: HouseholdContext | null,
): Promise<RecipeForLLM[]> {
  const cats = categories ?? ['main_dish']

  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - cooldownDays)
  const cutoffStr = toDateString(cutoff)

  // Parallelize recipe fetch and history fetch — they are independent
  const [recipeRows, historyRows] = await Promise.all([
    db.select({ id: recipes.id, title: recipes.title, tags: recipes.tags })
      .from(recipes)
      .where(and(
        inArray(recipes.category, cats),
        scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, userId, ctx ?? null),
      )),
    db.select({ recipeId: recipeHistory.recipeId })
      .from(recipeHistory)
      .where(and(
        eq(recipeHistory.userId, userId),
        gte(recipeHistory.madeOn, cutoffStr),
      )),
  ])

  if (recipeRows.length === 0) return []

  const recentlyMadeIds = new Set(historyRows.map((h) => h.recipeId))

  return recipeRows.filter((r) => !recentlyMadeIds.has(r.id))
}

export async function fetchRecipesByMealTypes(
  userId: string,
  cooldownDays: number,
  mealTypes: MealType[],
  ctx?: HouseholdContext | null,
): Promise<Record<MealType, RecipeForLLM[]>> {
  // Compute the cooldown cutoff once
  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - cooldownDays)
  const cutoffStr = toDateString(cutoff)

  // Fetch history ONCE (shared across all meal types) in parallel with all recipe queries
  const historyPromise = db
    .select({ recipeId: recipeHistory.recipeId })
    .from(recipeHistory)
    .where(and(
      eq(recipeHistory.userId, userId),
      gte(recipeHistory.madeOn, cutoffStr),
    ))

  const recipePromises = mealTypes.map((mt) => {
    const cats = MEAL_TYPE_CATEGORIES[mt]
    return db
      .select({ id: recipes.id, title: recipes.title, tags: recipes.tags })
      .from(recipes)
      .where(and(
        inArray(recipes.category, cats),
        scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, userId, ctx ?? null),
      ))
  })

  // Fire all queries in parallel: one history + N recipe queries
  const [historyRows, ...recipeResults] = await Promise.all([
    historyPromise,
    ...recipePromises,
  ])

  const recentlyMadeIds = new Set(historyRows.map((h) => h.recipeId))

  const result = {} as Record<MealType, RecipeForLLM[]>
  mealTypes.forEach((mt, i) => {
    const rows = recipeResults[i] ?? []
    result[mt] = rows.filter((r) => !recentlyMadeIds.has(r.id))
  })
  return result
}

export async function fetchRecentHistory(
  userId: string,
): Promise<{ title: string; madeOn: string }[]> {
  const rows = await db
    .select({
      madeOn: recipeHistory.madeOn,
      title: recipes.title,
    })
    .from(recipeHistory)
    .innerJoin(recipes, eq(recipeHistory.recipeId, recipes.id))
    .where(eq(recipeHistory.userId, userId))
    .orderBy(desc(recipeHistory.madeOn))
    .limit(10)

  return rows.map((h) => ({
    title: h.title ?? '',
    madeOn: h.madeOn,
  }))
}

export async function fetchUserPreferences(
  userId: string,
  ctx?: HouseholdContext | null,
): Promise<UserPreferences | null> {
  const rows = await db
    .select()
    .from(userPreferences)
    .where(scopeCondition(
      { userId: userPreferences.userId, householdId: userPreferences.householdId },
      userId,
      ctx ?? null,
    ))
    .limit(1)

  const data = dbFirst(rows)
  if (!data) return null

  return {
    id: data.id,
    userId: data.userId,
    optionsPerDay: data.optionsPerDay,
    cooldownDays: data.cooldownDays,
    seasonalMode: data.seasonalMode,
    preferredTags: data.preferredTags,
    avoidedTags: data.avoidedTags,
    limitedTags: data.limitedTags as unknown as LimitedTag[],
    seasonalRules: data.seasonalRules as UserPreferences['seasonalRules'],
    onboardingCompleted: data.onboardingCompleted,
    isActive: data.isActive,
    mealContext: data.mealContext ?? null,
    hiddenTags: data.hiddenTags ?? [],
    lastActiveDays: data.lastActiveDays ?? null,
    lastActiveMealTypes: data.lastActiveMealTypes ?? null,
    createdAt: data.createdAt.toISOString(),
  } satisfies UserPreferences
}

// ── Prompt construction ─────────────────────────────────────────────────────────

function buildAvoidedTags(prefs: UserPreferences | null, sessionAvoid: string[]): string {
  const combined = Array.from(new Set([...(prefs?.avoidedTags ?? []), ...sessionAvoid]))
  return combined.length ? combined.join(', ') : 'none'
}

function buildPreferredTags(prefs: UserPreferences | null, sessionPrefer: string[]): string {
  const combined = Array.from(new Set([...(prefs?.preferredTags ?? []), ...sessionPrefer]))
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
  if (!prefs?.seasonalMode) return ''
  const rules = (prefs.seasonalRules as Record<string, { favor?: string[]; cap?: Record<string, number>; exclude?: string[] }> | null)?.[season]
  if (!rules) return ''
  const parts: string[] = []
  if (rules.favor?.length) parts.push(`Favor ${rules.favor.join(', ')} recipes.`)
  if (rules.cap) {
    Object.entries(rules.cap).forEach(([tag, cap]) => parts.push(`Cap ${tag} at ${cap} total across the week.`))
  }
  if (rules.exclude?.length) parts.push(`Exclude ${rules.exclude.join(', ')} recipes.`)
  return parts.join(' ')
}

function buildTasteProfileSection(profile: TasteProfile): string {
  const parts: string[] = []
  if (profile.lovedRecipeIds.length) {
    parts.push(`Loved recipes (boost these in suggestions): ${profile.lovedRecipeIds.join(', ')}`)
  }
  if (profile.dislikedRecipeIds.length) {
    parts.push(`Disliked recipes (avoid these): ${profile.dislikedRecipeIds.join(', ')}`)
  }
  if (profile.topTags.length) {
    parts.push(`User's top flavor tags: ${profile.topTags.join(', ')}`)
  }
  if (parts.length > 0 && profile.cookingFrequency !== 'moderate') {
    parts.push(`Cooking frequency: ${profile.cookingFrequency}`)
  }
  return parts.length ? `\n\nTaste profile:\n${parts.join('\n')}` : ''
}

export function buildSystemMessage(
  prefs: UserPreferences | null,
  sessionPrefer: string[],
  sessionAvoid: string[],
  season: 'spring' | 'summer' | 'autumn' | 'winter',
  profile?: TasteProfile,
): string {
  const optionsPerDay = prefs?.optionsPerDay ?? 3
  const avoided = buildAvoidedTags(prefs, sessionAvoid)
  const preferred = buildPreferredTags(prefs, sessionPrefer)
  const limited = buildLimitedTagsSummary(prefs?.limitedTags ?? [])
  const seasonal = buildSeasonalInstructions(prefs, season)

  const mealContextLine = prefs?.mealContext
    ? `\nHousehold context: ${prefs.mealContext}`
    : ''

  const base = `You are a meal planning assistant. You will be given a list of recipes and user preferences, and you must suggest meals for specific days of the week.${mealContextLine}

Rules you must follow exactly:
- Only suggest recipes from the provided recipe list. Never invent recipes.
- Only use recipeIds from the provided list. Never guess or modify ids.
- Return exactly ${optionsPerDay} options per day.
- Never suggest the same recipe for more than one day.
- Never suggest recipes with avoided tags: ${avoided}.
- Prefer recipes with preferred tags: ${preferred}.
- Respect weekly tag caps: ${limited}.
  e.g. if "Comfort" cap is 2, the total options across all days with the "Comfort" tag must not exceed 2.
- Current season is ${season}.${seasonal ? ' ' + seasonal : ''}
- Variety matters: spread different recipe types AND tag groups across the week. No single tag (especially cuisine or cooking-style tags) should appear across more than 2 days worth of options. Avoid clustering similar recipes on the same day.

For each day, also include a "whyThisDay" field: a one-sentence explanation of why these recipes were chosen for this day, referencing the user's history, preferences, seasonal context, or weekly context. Keep it conversational and brief (under 20 words).

Return ONLY valid JSON in this exact format, with no prose, no markdown:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "whyThisDay": "Quick picks — you like fast meals on Mondays",
      "mealTypes": [
        {
          "mealType": "dinner",
          "options": [
            {
              "recipeId": "uuid",
              "recipeTitle": "Recipe Name",
              "reason": "One-line reason, e.g. Quick weeknight option"
            }
          ]
        }
      ]
    }
  ]
}`
  return base + (profile ? buildTasteProfileSection(profile) : '')
}

export async function fetchPantryContext(
  userId: string,
  ctx?: HouseholdContext | null,
): Promise<string> {
  try {
    const items = await db
      .select({ name: pantryItems.name, expiryDate: pantryItems.expiryDate })
      .from(pantryItems)
      .where(scopeCondition(
        { userId: pantryItems.userId, householdId: pantryItems.householdId },
        userId,
        ctx ?? null,
      ))
      .orderBy(asc(pantryItems.expiryDate), asc(pantryItems.name))
      .limit(30)

    if (!items.length) return ''

    const lines = items.map((item) => {
      const expiry = item.expiryDate ? ` (expires ${item.expiryDate})` : ''
      return `- ${item.name}${expiry}`
    })

    return `Pantry items on hand (bias suggestions toward recipes using these, especially items expiring soon):\n${lines.join('\n')}`
  } catch {
    return ''
  }
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

export function buildFullWeekUserMessage(
  activeDates: string[],
  recipesByMealType: Record<MealType, RecipeForLLM[]>,
  recentHistory: { title: string; madeOn: string }[],
  freeText: string,
  activeMealTypes: MealType[],
  pantryContext: string = '',
  lovedIds?: Set<string>,
): string {
  const recipesSection = activeMealTypes.map((mt) => {
    const all = recipesByMealType[mt] ?? []
    const loved = all.filter((r) => lovedIds?.has(r.id))
    const others = shuffleArray(all.filter((r) => !lovedIds?.has(r.id)))
    const list = [...loved, ...others].map((r) => ({
      recipeId: r.id,
      title: lovedIds?.has(r.id) ? `${r.title} [LOVED]` : r.title,
      tags: r.tags,
    }))
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

Pantry context:
${pantryContext || '(none)'}`
}

export function buildSwapUserMessage(
  date: string,
  mealType: MealType,
  recipes: RecipeForLLM[],
  recentHistory: { title: string; madeOn: string }[],
  alreadySelected: { date: string; recipeId: string }[],
  freeText: string,
  allRecipes: RecipeForLLM[],
  pantryContext: string = '',
): string {
  const selectedTitles = alreadySelected
    .map((s) => allRecipes.find((r) => r.id === s.recipeId)?.title ?? s.recipeId)
    .filter(Boolean)
    .join(', ')

  const recipesForPrompt = recipes.map((r) => ({ recipeId: r.id, title: r.title, tags: r.tags }))
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
    whyThisDay: day.whyThisDay,
    mealTypes: (day.mealTypes ?? []).map((mts) => ({
      mealType: mts.mealType,
      options: mts.options.filter((opt) => {
        const ids = validIdsByMealType.get(mts.mealType)
        return ids ? ids.has(opt.recipeId) : false
      }),
    })),
  }))
}

/**
 * Compute a confidence score (0-4) for a recipe suggestion.
 * Server-computed from tag overlap and seasonal match.
 */
export function computeConfidence(
  recipeTags: string[],
  prefs: UserPreferences | null,
  season: string,
): number {
  let score = 0
  const preferredTags = prefs?.preferredTags ?? []
  const seasonalRules = prefs?.seasonalRules?.[season]

  // Tag overlap with preferred tags: +25 per overlap, max 50
  const tagOverlap = recipeTags.filter((t) => preferredTags.includes(t)).length
  score += Math.min(tagOverlap * 25, 50)

  // Seasonal match: +15 if recipe has a tag in seasonal favor list
  if (seasonalRules?.favor?.some((f) => recipeTags.includes(f))) {
    score += 15
  }

  // Base score for being in the suggestion at all: +20
  score += 20

  // Map 0-85 to 0-4 bars
  return Math.min(Math.round(score / 25), 4)
}

/**
 * Attach confidence scores to all suggestions.
 * Looks up recipe tags from the recipesByMealType map.
 */
export function attachConfidenceScores(
  days: DaySuggestions[],
  recipeTagsById: Map<string, string[]>,
  prefs: UserPreferences | null,
  season: string,
): void {
  for (const day of days) {
    for (const mts of day.mealTypes) {
      for (const opt of mts.options) {
        const tags = recipeTagsById.get(opt.recipeId) ?? []
        opt.confidenceScore = computeConfidence(tags, prefs, season)
      }
    }
  }
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
