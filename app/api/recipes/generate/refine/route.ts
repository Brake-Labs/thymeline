import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { callLLMMultimodal, classifyLLMError, parseLLMJson, LLM_MODEL_CAPABLE } from '@/lib/llm'
import { generateRefineSchema, parseBody } from '@/lib/schemas'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import { RECIPE_CATEGORIES } from '@/types'
import type { GeneratedRecipe, RecipeCategory } from '@/types'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'

function parsePositiveInt(val: unknown): number | null {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) return null
  return val > 0 ? val : null
}

function parseNonNegativeInt(val: unknown): number | null {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) return null
  return val
}

interface GeneratedRefinementResponse {
  message:              string
  changes:              string[]
  title:                string
  ingredients:          string
  steps:                string
  tags:                 string[]
  category:             string
  servings:             number | null
  prepTimeMinutes:      number | null
  cookTimeMinutes:      number | null
  totalTimeMinutes:     number | null
  inactiveTimeMinutes:  number | null
  notes:                string | null
}

export const POST = withAuth(async (req: NextRequest, { user: _user }) => {
  const { data: body, error: parseError } = await parseBody(req, generateRefineSchema)
  if (parseError) return parseError

  const { message, current_recipe, conversation_history, generation_context } = body

  const tagLookup = new Map(FIRST_CLASS_TAGS.map((t) => [t.toLowerCase(), t]))

  const systemMessage = `You are a creative recipe developer helping a home cook refine a recipe before they save it.

Rules:
- Make only the changes the user requests — do not alter anything else
- Be practical: suggest the best substitution if an ingredient is unavailable
- Respect any dietary restrictions already in the recipe unless the user asks you to change them
- Keep the recipe realistic and cookable for a home cook
- Respond conversationally — briefly confirm what you changed (1-2 sentences)
- Return the COMPLETE updated recipe — all fields, not just the changed parts
- Suggest tags only from this list: ${FIRST_CLASS_TAGS.join(', ')}

Return ONLY valid JSON with no prose or markdown:
{
  "message": "Brief confirmation of what changed (1-2 sentences)",
  "changes": ["specific change 1", "specific change 2"],
  "title": "Recipe title",
  "ingredients": "full ingredient list with modifications",
  "steps": "full steps with modifications",
  "tags": ["Tag1"],
  "category": "main_dish|breakfast|dessert|side_dish",
  "servings": 4,
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 30,
  "totalTimeMinutes": 45,
  "inactiveTimeMinutes": null,
  "notes": "updated notes or null"
}`

  const messages: MessageParam[] = []

  if (conversation_history.length === 0) {
    // First refinement turn: include generation context
    const userContent = `I just generated a ${generation_context.meal_type} recipe with these preferences:
Style: ${generation_context.style_hints || 'none'}
Dietary restrictions: ${generation_context.dietary_restrictions.join(', ') || 'none'}

Here is the current recipe:

Title: ${current_recipe.title}
Servings: ${current_recipe.servings ?? 'not specified'}

Ingredients:
${current_recipe.ingredients}

Steps:
${current_recipe.steps}

Notes: ${current_recipe.notes ?? 'none'}

My request: ${message}`

    messages.push({ role: 'user', content: userContent })
  } else {
    // Subsequent turns: include full conversation history
    for (const turn of conversation_history) {
      messages.push({ role: turn.role, content: turn.content })
    }

    const userContent = `Current recipe:

Title: ${current_recipe.title}
Servings: ${current_recipe.servings ?? 'not specified'}

Ingredients:
${current_recipe.ingredients}

Steps:
${current_recipe.steps}

Notes: ${current_recipe.notes ?? 'none'}

My new request: ${message}`

    messages.push({ role: 'user', content: userContent })
  }

  let raw: string
  try {
    raw = await callLLMMultimodal({
      model: LLM_MODEL_CAPABLE,
      maxTokens: 2048,
      system: systemMessage,
      messages,
    })
  } catch (err) {
    const llmErr = classifyLLMError(err)
    console.error('[generate/refine] LLM error:', llmErr.code, llmErr.message)
    return NextResponse.json({ error: 'Recipe refinement failed — please try again' }, { status: 500 })
  }

  let parsed: GeneratedRefinementResponse
  try {
    parsed = parseLLMJson<GeneratedRefinementResponse>(raw)
  } catch (err) {
    console.error('[generate/refine] JSON parse error:', err)
    return NextResponse.json({ error: 'Recipe refinement failed — please try again' }, { status: 500 })
  }

  // Validate title
  const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : null
  if (!title) {
    console.error('[generate/refine] Missing title in LLM response')
    return NextResponse.json({ error: 'Recipe refinement failed — please try again' }, { status: 500 })
  }

  // Filter tags against FIRST_CLASS_TAGS
  const rawTags = Array.isArray(parsed.tags) ? parsed.tags : []
  const tags = rawTags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => tagLookup.get(t.toLowerCase()))
    .filter((t): t is string => t !== undefined)

  // Category validation + fallback to current recipe's category
  const llmCategory = typeof parsed.category === 'string' ? parsed.category : ''
  const category: RecipeCategory = (RECIPE_CATEGORIES as readonly string[]).includes(llmCategory)
    ? (llmCategory as RecipeCategory)
    : (current_recipe.category as RecipeCategory)

  const recipe: GeneratedRecipe = {
    title,
    ingredients: typeof parsed.ingredients === 'string' && parsed.ingredients.trim()
      ? parsed.ingredients
      : current_recipe.ingredients,
    steps: typeof parsed.steps === 'string' && parsed.steps.trim()
      ? parsed.steps
      : current_recipe.steps,
    tags,
    category,
    servings: parsePositiveInt(parsed.servings),
    prep_time_minutes: parseNonNegativeInt(parsed.prepTimeMinutes),
    cook_time_minutes: parseNonNegativeInt(parsed.cookTimeMinutes),
    total_time_minutes: parseNonNegativeInt(parsed.totalTimeMinutes),
    inactive_time_minutes: parseNonNegativeInt(parsed.inactiveTimeMinutes),
    notes: typeof parsed.notes === 'string' ? parsed.notes : null,
  }

  return NextResponse.json({
    message: typeof parsed.message === 'string' ? parsed.message : 'Recipe updated.',
    changes: Array.isArray(parsed.changes) ? parsed.changes.filter((c): c is string => typeof c === 'string') : [],
    recipe,
  })
})
