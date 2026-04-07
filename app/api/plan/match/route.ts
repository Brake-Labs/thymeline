import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { matchSchema, parseBody } from '@/lib/schemas'
import { scopeCondition } from '@/lib/household'
import { callLLMNonStreaming } from '../helpers'
import { parseLLMJson } from '@/lib/llm'
import { db } from '@/lib/db'
import { recipes } from '@/lib/db/schema'

const MAX_MATCHES = 3

export const POST = withAuth(async (req: NextRequest, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, matchSchema)
  if (parseError) return parseError

  const { query } = body

  // Fetch all recipes scoped by household or user (all categories)
  const recipeRows = await db
    .select({ id: recipes.id, title: recipes.title, tags: recipes.tags })
    .from(recipes)
    .where(scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, user.id, ctx))

  const recipeList = recipeRows as { id: string; title: string; tags: string[] }[]

  const toMatch = (r: { id: string; title: string }) => ({ recipe_id: r.id, recipe_title: r.title })

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
    if (keywordMatches.length > 0 && keywordMatches.length <= MAX_MATCHES) {
      return NextResponse.json({ matches: keywordMatches.map(toMatch) })
    }
    // More than MAX_MATCHES keyword hits — ask LLM to rank and pick top 3
    if (keywordMatches.length > MAX_MATCHES) {
      try {
        const systemMessage = `You are helping find recipes from a user's personal recipe vault.
Rank the top ${MAX_MATCHES} best matches from the candidate list for the search phrase.
Return ONLY valid JSON: { "recipe_ids": ["uuid1", "uuid2", "uuid3"] } (fewer if fewer match well)`
        const userMessage = `Search phrase: "${query}"\nCandidates: ${JSON.stringify(keywordMatches.map((r) => ({ recipe_id: r.id, title: r.title, tags: r.tags })))}`
        const raw = await callLLMNonStreaming(systemMessage, userMessage)
        const parsed = parseLLMJson<{ recipe_ids: string[] }>(raw)
        const ranked = (parsed.recipe_ids ?? [])
          .map((id) => keywordMatches.find((r) => r.id === id))
          .filter((r): r is typeof keywordMatches[number] => r !== undefined)
          .slice(0, MAX_MATCHES)
        if (ranked.length > 0) return NextResponse.json({ matches: ranked.map(toMatch) })
        // Fall through to return first few keyword matches if LLM fails
        return NextResponse.json({ matches: keywordMatches.slice(0, MAX_MATCHES).map(toMatch) })
      } catch {
        return NextResponse.json({ matches: keywordMatches.slice(0, MAX_MATCHES).map(toMatch) })
      }
    }
  }

  // ── Step 2: LLM fallback for queries with no keyword match ──────────────────
  const systemMessage = `You are helping find recipes from a user's personal recipe vault.
Given a search phrase and a list of recipes, return the recipe_ids of the top ${MAX_MATCHES} best matches.
Match on recipe title words, tags, or general category.
Only omit a recipe if the query has absolutely no connection to it.
Return ONLY valid JSON: { "recipe_ids": ["uuid1", "uuid2"] } (empty array if nothing matches)`

  const userMessage = `Search phrase: "${query}"
Recipes: ${JSON.stringify(recipeList)}`

  try {
    const raw = await callLLMNonStreaming(systemMessage, userMessage)
    const parsed = parseLLMJson<{ recipe_ids: string[] }>(raw)
    const matchedIds = parsed.recipe_ids ?? []

    const matches = matchedIds
      .map((id) => recipeList.find((r) => r.id === id))
      .filter((r): r is typeof recipeList[number] => r !== undefined)
      .slice(0, MAX_MATCHES)
      .map(toMatch)

    return NextResponse.json({ matches })
  } catch (err) {
    console.error('LLM match error:', err)
    return NextResponse.json({ matches: [] })
  }
})
