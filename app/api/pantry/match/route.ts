import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import type { PantryMatch } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.LLM_API_KEY })

const SYSTEM_PROMPT = `You are a recipe matching assistant. Given a pantry contents list and a recipe catalog, rank the recipes by how many pantry ingredients they use. Return only valid JSON with no prose.`

// ── POST /api/pantry/match ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // 1. Fetch all pantry items
  const { data: pantryItems } = await db
    .from('pantry_items')
    .select('name')
    .eq('user_id', user.id)

  if (!pantryItems || pantryItems.length === 0) {
    return NextResponse.json({ matches: [] })
  }

  // 2. Fetch user's recipes
  const { data: recipes } = await db
    .from('recipes')
    .select('id, title, ingredients, tags')
    .eq('user_id', user.id)

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
    const response = await anthropic.messages.create({
      model: process.env.LLM_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned) as { matches: PantryMatch[] }

    if (!Array.isArray(parsed.matches)) {
      return NextResponse.json({ matches: [] })
    }

    return NextResponse.json({ matches: parsed.matches.slice(0, 5) })
  } catch {
    return NextResponse.json({ matches: [] })
  }
}
