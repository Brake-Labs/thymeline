import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { callLLM, classifyLLMError, LLM_MODEL_CAPABLE } from '@/lib/llm'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import { generateRecipeSchema, parseBody } from '@/lib/schemas'
import { deriveTasteProfile } from '@/lib/taste-profile'
import { detectWasteOverlap } from '@/lib/waste-overlap'
import { fetchCurrentWeekPlan, getPlanWasteBadgeText } from '@/lib/plan-utils'
import { RECIPE_CATEGORIES } from '@/types'
import type { GeneratedRecipe, MealType, RecipeCategory } from '@/types'
import type { RecipeForOverlap } from '@/lib/waste-overlap'

const GENERATE_WASTE_TIMEOUT_MS = 5000

function mealTypeToCategory(mealType: MealType): RecipeCategory {
  switch (mealType) {
    case 'dinner':
    case 'lunch':     return 'main_dish'
    case 'breakfast': return 'breakfast'
    case 'snack':     return 'side_dish'
    case 'dessert':   return 'dessert'
  }
}

function parsePositiveInt(val: unknown): number | null {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) return null
  return val > 0 ? val : null
}

function parseNonNegativeInt(val: unknown): number | null {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) return null
  return val
}

export const POST = withAuth(async (req: NextRequest, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, generateRecipeSchema)
  if (parseError) return parseError

  const { specificIngredients, mealType, styleHints, dietaryRestrictions, tweakRequest, previousRecipe } = body

  // Fetch taste profile + current plan in parallel
  const [tasteProfile, currentPlanRecipes] = await Promise.all([
    deriveTasteProfile(user.id, null, ctx ?? null).catch(() => null),
    fetchCurrentWeekPlan(user.id, null, ctx ?? null).catch(() => [] as RecipeForOverlap[]),
  ])

  // Parse specificIngredients
  const combined = (specificIngredients ?? '')
    .split(/[,\n]/)
    .map((s: string) => s.trim())
    .filter(Boolean)

  if (combined.length === 0) {
    return NextResponse.json({ error: 'No ingredients provided' }, { status: 400 })
  }

  const combinedIngredientList = combined.map((l: string) => `- ${l}`).join('\n')

  const tasteLines: string[] = []
  if (tasteProfile?.mealContext) tasteLines.push(`Household context: ${tasteProfile.mealContext}`)
  if (tasteProfile?.topTags?.length) tasteLines.push(`Favourite styles: ${tasteProfile.topTags.slice(0, 5).join(', ')}`)
  if (tasteProfile?.avoidedTags?.length) tasteLines.push(`Avoid: ${tasteProfile.avoidedTags.join(', ')}`)
  if (tasteProfile?.cookingFrequency) tasteLines.push(`Cooking frequency: ${tasteProfile.cookingFrequency}`)
  const tasteSection = tasteLines.length > 0 ? `\n\n${tasteLines.join('\n')}` : ''

  const systemMessage = `You are a creative recipe developer. Generate a complete, practical recipe based on the ingredients and preferences provided. The recipe should be realistic, delicious, and something a home cook can make.${tasteSection}

Rules:
- Use the provided ingredients as the primary basis for the recipe
- You may add common pantry staples (salt, pepper, oil, garlic, onion) without them being listed — these are assumed available
- Respect all dietary restrictions strictly
- Match the requested meal type and any style hints
- Keep steps clear and practical for a home cook
- Suggest relevant tags only from this list: ${FIRST_CLASS_TAGS.join(', ')}

Return ONLY valid JSON with no prose or markdown:
{
  "title": "Recipe Name",
  "ingredients": "ingredient 1\\ningredient 2\\n...",
  "steps": "step 1\\nstep 2\\n...",
  "tags": ["Tag1", "Tag2"],
  "category": "main_dish|breakfast|dessert|side_dish",
  "servings": 4,
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 30,
  "totalTimeMinutes": 45,
  "inactiveTimeMinutes": null,
  "notes": "Optional note about the recipe"
}`

  const userMessage = tweakRequest && previousRecipe
    ? `You previously generated this recipe:

Title: ${previousRecipe.title}

Ingredients:
${previousRecipe.ingredients}

Steps:
${previousRecipe.steps}

The user wants this adjustment: "${tweakRequest}"

Generate a revised version of the recipe that incorporates this adjustment. Keep everything else the same unless the change requires it.

Original context:
Ingredients to use:
${combinedIngredientList}

Style / cuisine hints: ${styleHints || 'none'}

Dietary restrictions: ${dietaryRestrictions.length > 0 ? dietaryRestrictions.join(', ') : 'none'}`
    : `Generate a ${mealType} recipe.

Ingredients to use:
${combinedIngredientList}

Style / cuisine hints: ${styleHints || 'none'}

Dietary restrictions: ${dietaryRestrictions.length > 0 ? dietaryRestrictions.join(', ') : 'none'}

Make it practical and delicious.`

  let raw: string
  try {
    raw = await callLLM({
      model: LLM_MODEL_CAPABLE,
      maxTokens: 2048,
      system: systemMessage,
      user: userMessage,
    })
  } catch (err) {
    const llmErr = classifyLLMError(err)
    console.error('[generate] LLM error:', llmErr.code, llmErr.message)
    const status = llmErr.code === 'rate_limit' ? 429 : llmErr.code === 'timeout' ? 504 : 500
    return NextResponse.json({ error: 'Recipe generation failed — please try again' }, { status })
  }

  // Strip markdown code fences
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    console.error('[generate] JSON parse error:', err, 'raw:', raw)
    return NextResponse.json({ error: 'Recipe generation failed — please try again' }, { status: 500 })
  }

  const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : null
  if (!title) {
    console.error('[generate] Missing title in LLM response')
    return NextResponse.json({ error: 'Recipe generation failed — please try again' }, { status: 500 })
  }

  // Filter tags against FIRST_CLASS_TAGS (case-insensitive, return canonical casing)
  const tagLookup = new Map(FIRST_CLASS_TAGS.map((t) => [t.toLowerCase(), t]))
  const rawTags = Array.isArray(parsed.tags) ? parsed.tags : []
  const tags = rawTags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => tagLookup.get(t.toLowerCase()))
    .filter((t): t is string => t !== undefined)

  // Category validation + fallback
  const llmCategory = typeof parsed.category === 'string' ? parsed.category : ''
  const category: RecipeCategory = (RECIPE_CATEGORIES as readonly string[]).includes(llmCategory)
    ? (llmCategory as RecipeCategory)
    : mealTypeToCategory(mealType)

  const result: GeneratedRecipe = {
    title,
    ingredients: typeof parsed.ingredients === 'string' && parsed.ingredients.trim()
      ? parsed.ingredients
      : '',
    steps: typeof parsed.steps === 'string' && parsed.steps.trim()
      ? parsed.steps
      : '',
    tags,
    category,
    servings: parsePositiveInt(parsed.servings),
    prepTimeMinutes: parseNonNegativeInt(parsed.prepTimeMinutes),
    cookTimeMinutes: parseNonNegativeInt(parsed.cookTimeMinutes),
    totalTimeMinutes: parseNonNegativeInt(parsed.totalTimeMinutes),
    inactiveTimeMinutes: parseNonNegativeInt(parsed.inactiveTimeMinutes),
    notes: typeof parsed.notes === 'string' ? parsed.notes : null,
  }

  // ── Waste overlap detection ───────────────────────────────────────────────
  if (currentPlanRecipes.length > 0 && result.ingredients) {
    try {
      const candidateRecipes: RecipeForOverlap[] = [{
        recipeId: '__generated__',
        title: result.title,
        ingredients: result.ingredients,
      }]
      const wasteMap = await Promise.race([
        detectWasteOverlap(candidateRecipes, currentPlanRecipes, callLLM),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), GENERATE_WASTE_TIMEOUT_MS)
        ),
      ])
      const matches = wasteMap.get('__generated__')
      if (matches && matches.length > 0) {
        result.wasteMatches = matches.map((m) => ({ ingredient: m.ingredient, wasteRisk: m.wasteRisk }))
        result.wasteBadgeText = getPlanWasteBadgeText(matches)
      }
    } catch (err) {
      console.warn('[generate] waste detection skipped:', err)
    }
  }

  return NextResponse.json(result)
})
