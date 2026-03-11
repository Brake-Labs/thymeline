import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { callLLMNonStreaming } from '../helpers'
import { ChatRoles } from 'any-llm'

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { query: string; date: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { query } = body

  // Fetch all recipes for this user (all categories)
  const { data: recipes } = await supabase
    .from('recipes')
    .select('id, title, tags')
    .eq('user_id', user.id)

  const recipeList = (recipes ?? []) as { id: string; title: string; tags: string[] }[]

  const systemMessage = `You are helping find a recipe from a user's personal recipe vault.
Given a search phrase and a list of recipes, return the recipe_id of the best match, or null if there is no confident match.
Return ONLY valid JSON: { "recipe_id": "uuid" } or { "recipe_id": null }`

  const userMessage = `Search phrase: "${query}"
Recipes: ${JSON.stringify(recipeList)}`

  try {
    const raw = await callLLMNonStreaming(systemMessage, userMessage)
    const parsed = JSON.parse(raw.trim()) as { recipe_id: string | null }
    const matchedId = parsed.recipe_id

    if (!matchedId) {
      return NextResponse.json({ match: null })
    }

    const found = recipeList.find((r) => r.id === matchedId)
    if (!found) {
      return NextResponse.json({ match: null })
    }

    return NextResponse.json({ match: { recipe_id: found.id, recipe_title: found.title } })
  } catch (err) {
    console.error('LLM match error:', err)
    return NextResponse.json({ match: null })
  }
}
