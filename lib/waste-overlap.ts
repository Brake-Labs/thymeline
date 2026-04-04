// server-only — do not import from client components

import { parseLLMJsonSafe, LLM_MODEL_FAST } from '@/lib/llm'
import type { callLLM } from '@/lib/llm'
import type { WasteMatch } from '@/types'

export interface RecipeForOverlap {
  recipe_id:   string
  title:       string
  ingredients: string
}

const OVERLAP_DETECTION_TIMEOUT_MS = 8000

function buildOverlapPrompt(
  thisWeek: RecipeForOverlap[],
  nextWeek: RecipeForOverlap[],
): string {
  const formatRecipe = (r: RecipeForOverlap) =>
    `${r.recipe_id}: ${r.title}\nIngredients: ${r.ingredients}`

  const thisSection = thisWeek.length
    ? `RECIPES THIS WEEK:\n${thisWeek.map(formatRecipe).join('\n\n')}`
    : ''

  const nextSection = nextWeek.length
    ? `RECIPES NEXT WEEK (already planned):\n${nextWeek.map(formatRecipe).join('\n\n')}`
    : ''

  return `${thisSection}\n\n${nextSection}\n\n
Identify shared ingredients across these recipes that have waste risk — things that come in quantities larger than one recipe needs: produce, dairy, opened cans, fresh herbs, specialty ingredients. Exclude pantry staples (salt, pepper, oil, sugar, flour, dried spices, vinegar, soy sauce, common condiments).

Return ONLY valid JSON, no markdown:
[
  {
    "ingredient": "ingredient name",
    "recipe_ids": ["id1", "id2"],
    "waste_risk": "high" | "medium"
  }
]

Return [] if no meaningful overlap exists.`
}

type RawOverlapEntry = {
  ingredient: string
  recipe_ids: string[]
  waste_risk: 'high' | 'medium'
}

export async function detectWasteOverlap(
  thisWeekRecipes: RecipeForOverlap[],
  nextWeekRecipes: RecipeForOverlap[],
  llm: typeof callLLM,
): Promise<Map<string, WasteMatch[]>> {
  if (thisWeekRecipes.length === 0 && nextWeekRecipes.length === 0) {
    return new Map()
  }

  const raw = await llm({
    model:     LLM_MODEL_FAST,
    system:    'You are analyzing recipe ingredient lists to identify ingredient overlap that could help reduce food waste. Return only valid JSON arrays.',
    user:      buildOverlapPrompt(thisWeekRecipes, nextWeekRecipes),
    maxTokens: 1024,
  })

  const entries = parseLLMJsonSafe<RawOverlapEntry[]>(raw)
  if (!entries || !Array.isArray(entries)) return new Map()

  const nextWeekIds = new Set(nextWeekRecipes.map((r) => r.recipe_id))
  const result = new Map<string, WasteMatch[]>()

  for (const entry of entries) {
    const { ingredient, recipe_ids, waste_risk } = entry
    if (!ingredient || !Array.isArray(recipe_ids) || recipe_ids.length < 2) continue

    for (const id of recipe_ids) {
      const others = recipe_ids.filter((r) => r !== id)
      const match: WasteMatch = {
        ingredient,
        waste_risk,
        shared_with:   others,
        has_next_week: others.some((r) => nextWeekIds.has(r)),
      }
      const existing = result.get(id) ?? []
      result.set(id, [...existing, match])
    }
  }

  return result
}

export function getPrimaryWasteBadgeText(matches: WasteMatch[]): string {
  if (!matches.length) return ''

  if (matches.length >= 2) {
    return `Uses up ${matches.length} ingredients`
  }

  const match = matches[0]!
  if (match.has_next_week) {
    return "Pairs with next week's plan"
  }
  return `Uses up your ${match.ingredient}`
}

export { OVERLAP_DETECTION_TIMEOUT_MS }
