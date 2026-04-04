import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { callLLM, classifyLLMError, parseLLMJson, LLM_MODEL_CAPABLE } from '@/lib/llm'
import { scopeQuery } from '@/lib/household'
import type { PantryMatch } from '@/types'

const SYSTEM_PROMPT = `You are a recipe matching assistant. Given a pantry contents list and a recipe catalog, rank the recipes by how many pantry ingredients they use. Return only valid JSON with no prose.`

// ── POST /api/pantry/match ────────────────────────────────────────────────────

export const POST = withAuth(async (req, { user, db, ctx }) => {
  // 1. Fetch all pantry items
  let pantryQ = db.from('pantry_items').select('name')
  pantryQ = scopeQuery(pantryQ, user.id, ctx)
  const { data: pantryItems } = await pantryQ

  if (!pantryItems || pantryItems.length === 0) {
    return NextResponse.json({ matches: [] })
  }

  // 2. Fetch user's recipes
  let recipesQ = db.from('recipes').select('id, title, ingredients, tags')
  recipesQ = scopeQuery(recipesQ, user.id, ctx)
  const { data: recipes } = await recipesQ

  if (!recipes || recipes.length === 0) {
    return NextResponse.json({ matches: [] })
  }

  const pantryNames = (pantryItems as { name: string }[]).map((p) => p.name)
  const recipeList = (recipes as { id: string; title: string; ingredients: string | null; tags: string[] }[]).map((r) => ({
    id: r.id,
    title: r.title,
    ingredients: r.ingredients ?? '',
  }))

  const userMessage = `Pantry items: ${pantryNames.join(', ')}

Recipes: ${JSON.stringify(recipeList)}

Rank these recipes by how many pantry ingredients they use. Return the top 5 in this format:
{ "matches": [{ "recipe_id": "uuid", "recipe_title": "title", "match_count": N, "matched_items": ["item1", "item2"] }] }`

  try {
    const rawText = await callLLM({
      model: LLM_MODEL_CAPABLE,
      maxTokens: 1024,
      system: SYSTEM_PROMPT,
      user: userMessage,
    })

    const parsed = parseLLMJson<{ matches: PantryMatch[] }>(rawText)

    if (!Array.isArray(parsed.matches)) {
      return NextResponse.json({ matches: [] })
    }

    return NextResponse.json({ matches: parsed.matches.slice(0, 5) })
  } catch (err) {
    const llmErr = classifyLLMError(err)
    console.error('[pantry/match] LLM error:', llmErr.code, llmErr.message)
    return NextResponse.json({ matches: [], error: 'Match service unavailable' })
  }
})
