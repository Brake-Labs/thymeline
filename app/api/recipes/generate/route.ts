import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { callLLM, classifyLLMError, LLM_MODEL_CAPABLE } from '@/lib/llm'
import { scopeQuery } from '@/lib/household'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import { generateRecipeSchema, parseBody } from '@/lib/schemas'
import { RECIPE_CATEGORIES } from '@/types'
import type { GeneratedRecipe, MealType, RecipeCategory } from '@/types'

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

export const POST = withAuth(async (req: NextRequest, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, generateRecipeSchema)
  if (parseError) return parseError

  const { use_pantry, specific_ingredients, meal_type, style_hints, dietary_restrictions } = body

  // Fetch pantry items if requested
  let pantryLines: string[] = []
  if (use_pantry) {
    let pantryQ = db.from('pantry_items').select('name, quantity')
    pantryQ = scopeQuery(pantryQ, user.id, ctx)
    const { data: pantryItems } = await pantryQ.order('name')

    pantryLines = (pantryItems ?? []).map((item: { name: string; quantity: string | null }) =>
      item.quantity ? `${item.quantity} ${item.name}` : item.name
    )
  }

  // Parse specific_ingredients
  const specificLines = (specific_ingredients ?? '')
    .split(/[,\n]/)
    .map((s: string) => s.trim())
    .filter(Boolean)

  // Deduplicate: pantry names take precedence
  const pantryLower = new Set(pantryLines.map((l) => l.split(' ').slice(-1)[0]!.toLowerCase()))
  const dedupedSpecific = specificLines.filter(
    (l) => !pantryLower.has(l.toLowerCase().split(' ').slice(-1)[0]!)
  )

  const combined = [...pantryLines, ...dedupedSpecific]

  if (combined.length === 0) {
    return NextResponse.json({ error: 'No ingredients provided' }, { status: 400 })
  }

  const combinedIngredientList = combined.map((l) => `- ${l}`).join('\n')

  const systemMessage = `You are a creative recipe developer. Generate a complete, practical recipe based on the ingredients and preferences provided. The recipe should be realistic, delicious, and something a home cook can make.

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

  const userMessage = `Generate a ${meal_type} recipe.

Ingredients to use:
${combinedIngredientList}

Style / cuisine hints: ${style_hints || 'none'}

Dietary restrictions: ${dietary_restrictions.length > 0 ? dietary_restrictions.join(', ') : 'none'}

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
    : mealTypeToCategory(meal_type)

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
    prep_time_minutes: parseNonNegativeInt(parsed.prepTimeMinutes),
    cook_time_minutes: parseNonNegativeInt(parsed.cookTimeMinutes),
    total_time_minutes: parseNonNegativeInt(parsed.totalTimeMinutes),
    inactive_time_minutes: parseNonNegativeInt(parsed.inactiveTimeMinutes),
    notes: typeof parsed.notes === 'string' ? parsed.notes : null,
  }

  return NextResponse.json(result)
})
