import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { matchSchema, parseBody } from '@/lib/schemas'
import { scopeQuery } from '@/lib/household'
import { callLLMNonStreaming } from '../helpers'
import { parseLLMJson } from '@/lib/llm'

export const POST = withAuth(async (req: NextRequest, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, matchSchema)
  if (parseError) return parseError

  const { query } = body

  // Fetch all recipes scoped by household or user (all categories)
  const recipesQ = scopeQuery(db.from('recipes').select('id, title, tags'), user.id, ctx)
  const { data: recipes } = await recipesQ

  const recipeList = (recipes ?? []) as { id: string; title: string; tags: string[] }[]

  // ── Step 1: keyword match (fast, no LLM) ───────────────────────────────────
  const STOP_WORDS = new Set([
    'something', 'with', 'a', 'an', 'the', 'and', 'or', 'for',
    'some', 'any', 'of', 'in', 'like', 'make', 'want', 'need',
  ])
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w))

  if (words.length > 0) {
    const keywordMatches = recipeList.filter((r) =>
      words.some(
        (w) => r.title.toLowerCase().includes(w) || r.tags.some((t) => t.toLowerCase().includes(w)),
      ),
    )
    if (keywordMatches.length === 1) {
      const m = keywordMatches[0]!
      return NextResponse.json({ match: { recipe_id: m.id, recipe_title: m.title } })
    }
    // Multiple keyword matches: pass only those to the LLM to narrow down
    if (keywordMatches.length > 1) {
      const first = keywordMatches[0]!
      try {
        const systemMessage = `You are helping find a recipe from a user's personal recipe vault.
Pick the single best match from the list for the search phrase. Return ONLY valid JSON: { "recipe_id": "uuid" }`
        const userMessage = `Search phrase: "${query}"\nCandidates: ${JSON.stringify(keywordMatches.map((r) => ({ recipe_id: r.id, title: r.title, tags: r.tags })))}`
        const raw = await callLLMNonStreaming(systemMessage, userMessage)
        const parsed = parseLLMJson<{ recipe_id: string | null }>(raw)
        const found = keywordMatches.find((r) => r.id === parsed.recipe_id)
        if (found) return NextResponse.json({ match: { recipe_id: found.id, recipe_title: found.title } })
        // Fall through to return first keyword match if LLM fails
        return NextResponse.json({ match: { recipe_id: first.id, recipe_title: first.title } })
      } catch {
        return NextResponse.json({ match: { recipe_id: first.id, recipe_title: first.title } })
      }
    }
  }

  // ── Step 2: LLM fallback for queries with no keyword match ──────────────────
  const systemMessage = `You are helping find a recipe from a user's personal recipe vault.
Given a search phrase and a list of recipes, return the recipe_id of the best match.
Match on recipe title words, tags, or general category.
Only return null if the query has absolutely no connection to any recipe in the list.
Return ONLY valid JSON: { "recipe_id": "uuid" } or { "recipe_id": null }`

  const userMessage = `Search phrase: "${query}"
Recipes: ${JSON.stringify(recipeList)}`

  try {
    const raw = await callLLMNonStreaming(systemMessage, userMessage)
    const parsed = parseLLMJson<{ recipe_id: string | null }>(raw)
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
})
