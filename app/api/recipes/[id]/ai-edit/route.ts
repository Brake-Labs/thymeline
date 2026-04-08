import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { parseBody } from '@/lib/schemas'
import { checkOwnership } from '@/lib/household'
import { callLLMMultimodal, parseLLMJson, LLMError, LLM_MODEL_CAPABLE } from '@/lib/llm'
import { aiEditSchema } from '@/lib/schemas'
import { deriveTasteProfile } from '@/lib/taste-profile'
import type { ModifiedRecipe, TasteProfile } from '@/types'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'

function buildSystemPrompt(profile: TasteProfile | null): string {
  const base = `You are a helpful cooking assistant making real-time modifications to a recipe based on the cook's needs tonight.

Rules:
- Make only the changes the user requests — don't alter anything else
- Be practical: suggest the best substitution if an ingredient is missing
- Keep the recipe realistic and cookable
- Respond conversationally — briefly confirm what you changed
- Return the COMPLETE modified recipe, not just the changed parts`

  const tasteLines: string[] = []
  if (profile?.mealContext) tasteLines.push(`Household context: ${profile.mealContext}`)
  if (profile?.topTags?.length) tasteLines.push(`Favourite styles: ${profile.topTags.slice(0, 5).join(', ')}`)
  if (profile?.avoidedTags?.length) tasteLines.push(`Avoid: ${profile.avoidedTags.join(', ')}`)

  const tasteSection = tasteLines.length > 0
    ? `\n\nHousehold taste profile:\n${tasteLines.join('\n')}`
    : ''

  return `${base}${tasteSection}

Return ONLY valid JSON with no prose, preamble, or markdown fences:
{
  "message": "Brief confirmation of what changed (1-2 sentences)",
  "changes": ["specific change 1", "specific change 2"],
  "title": "Recipe title (unchanged unless user asked to rename)",
  "ingredients": "full ingredient list with modifications applied",
  "steps": "full steps with modifications applied",
  "notes": "updated notes or null",
  "servings": 4
}`
}

type AIEditResponsePayload = {
  message:     string
  changes:     string[]
  title:       string
  ingredients: string
  steps:       string
  notes:       string | null
  servings:    number | null
}

export const POST = withAuth(async (req, { user, ctx }, params) => {
  const { data: body, error } = await parseBody(req, aiEditSchema)
  if (error) return error

  const ownership = await checkOwnership('recipes', params.id!, user.id, ctx)
  if (!ownership.owned) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tasteProfile = await deriveTasteProfile(user.id, null, ctx ?? null).catch(() => null)

  const { message, currentRecipe, conversationHistory } = body

  // Build the messages array for the LLM call
  const messages: MessageParam[] = []

  if (conversationHistory.length === 0) {
    // First turn: inject full recipe + user message
    const userContent = `Here is the recipe I'm cooking tonight:

Title: ${currentRecipe.title}
Servings: ${currentRecipe.servings ?? 'not specified'}

Ingredients:
${currentRecipe.ingredients}

Steps:
${currentRecipe.steps}

Notes: ${currentRecipe.notes ?? 'none'}

My request: ${message}`

    messages.push({ role: 'user', content: userContent })
  } else {
    // Subsequent turns: include prior conversation history, then new user message
    for (const turn of conversationHistory) {
      messages.push({ role: turn.role, content: turn.content })
    }

    const userContent = `Current recipe state:

Title: ${currentRecipe.title}
Servings: ${currentRecipe.servings ?? 'not specified'}

Ingredients:
${currentRecipe.ingredients}

Steps:
${currentRecipe.steps}

My new request: ${message}`

    messages.push({ role: 'user', content: userContent })
  }

  let text: string
  try {
    text = await callLLMMultimodal({
      model: LLM_MODEL_CAPABLE,
      maxTokens: 2048,
      system: buildSystemPrompt(tasteProfile),
      messages,
    })
  } catch (err) {
    if (err instanceof LLMError) {
      return NextResponse.json({ error: 'AI service error' }, { status: 500 })
    }
    return NextResponse.json({ error: 'AI service error' }, { status: 500 })
  }

  let parsed: AIEditResponsePayload
  try {
    parsed = parseLLMJson<AIEditResponsePayload>(text)
  } catch {
    return NextResponse.json({ error: 'AI service error' }, { status: 500 })
  }

  const recipe: ModifiedRecipe = {
    title:       parsed.title,
    ingredients: parsed.ingredients,
    steps:       parsed.steps,
    notes:       parsed.notes,
    servings:    parsed.servings,
  }

  return NextResponse.json({
    message: parsed.message,
    recipe,
    changes: parsed.changes,
  })
})
