import { type SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import type { RecipeSuggestion, UserPreferences, LimitedTag } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.LLM_API_KEY })

// ── Week helpers ───────────────────────────────────────────────────────────────

export function getMostRecentSunday(date: Date): string {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay()) // getDay() === 0 for Sunday
  return d.toISOString().split('T')[0]
}

export function isSunday(dateStr: string): boolean {
  return new Date(dateStr + 'T12:00:00Z').getDay() === 0
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
  supabase: SupabaseClient,
  userId: string,
  cooldownDays: number,
): Promise<RecipeForLLM[]> {
  // Fetch main_dish recipes for this user with their most recent made_on date
  const { data: recipes } = await supabase
    .from('recipes')
    .select('id, title, tags')
    .eq('user_id', userId)
    .eq('category', 'main_dish')

  if (!recipes || recipes.length === 0) return []

  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - cooldownDays)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  // Fetch recent history to find cooldown violations
  const { data: history } = await supabase
    .from('recipe_history')
    .select('recipe_id, made_on')
    .eq('user_id', userId)
    .gte('made_on', cutoffStr)

  const recentlyMadeIds = new Set((history ?? []).map((h: { recipe_id: string }) => h.recipe_id))

  return recipes.filter((r: RecipeForLLM) => !recentlyMadeIds.has(r.id))
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
    title: ((h.recipes as unknown) as { title: string } | null)?.title ?? '',
    made_on: h.made_on,
  }))
}

export async function fetchUserPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPreferences | null> {
  const { data } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()
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
      "options": [
        {
          "recipe_id": "uuid",
          "recipe_title": "Recipe Name",
          "reason": "One-line reason, e.g. Quick weeknight option"
        }
      ]
    }
  ]
}`
}

export function buildFullWeekUserMessage(
  activeDates: string[],
  recipes: RecipeForLLM[],
  recentHistory: { title: string; made_on: string }[],
  freeText: string,
  specificRequests: string,
): string {
  // Use recipe_id as the field name so it matches the expected output format exactly
  const recipesForPrompt = recipes.map((r) => ({ recipe_id: r.id, title: r.title, tags: r.tags }))
  return `Plan meals for these dates: ${activeDates.join(', ')}

Available recipes (main dish only, cooldown-filtered):
${JSON.stringify(recipesForPrompt)}

Recent meal history (avoid repeating recent meals):
${JSON.stringify(recentHistory)}

User context for this week:
${freeText || '(none)'}

Specific requests (best-effort):
${specificRequests || '(none)'}`
}

export function buildSwapUserMessage(
  date: string,
  recipes: RecipeForLLM[],
  recentHistory: { title: string; made_on: string }[],
  alreadySelected: { date: string; recipe_id: string }[],
  freeText: string,
  allRecipes: RecipeForLLM[],
): string {
  const selectedTitles = alreadySelected
    .map((s) => allRecipes.find((r) => r.id === s.recipe_id)?.title ?? s.recipe_id)
    .filter(Boolean)
    .join(', ')

  const recipesForPrompt = recipes.map((r) => ({ recipe_id: r.id, title: r.title, tags: r.tags }))
  return `Plan meals for these dates: ${date}

Available recipes (main dish only, cooldown-filtered):
${JSON.stringify(recipesForPrompt)}

Recent meal history (avoid repeating recent meals):
${JSON.stringify(recentHistory)}

Recipes already selected for other days (do not repeat these): ${selectedTitles || 'none'}

User context for this week:
${freeText || '(none)'}

Return suggestions for ${date} only.`
}

// ── LLM call + validation ──────────────────────────────────────────────────────

export function validateSuggestions(
  days: { date: string; options: RecipeSuggestion[] }[],
  validIds: Set<string>,
): { date: string; options: RecipeSuggestion[] }[] {
  return days.map((day) => ({
    date: day.date,
    options: day.options.filter((opt) => validIds.has(opt.recipe_id)),
  }))
}

export async function callLLMNonStreaming(
  systemMessage: string,
  userMessage: string,
): Promise<string> {
  const response = await anthropic.messages.create({
    model: process.env.LLM_MODEL ?? 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: userMessage }],
    system: systemMessage,
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}
