import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { callLLM, LLM_MODEL_CAPABLE, parseLLMJson } from '@/lib/llm'
import { searchRecipesSchema, parseBody } from '@/lib/schemas'
import { scopeCondition } from '@/lib/household'
import { db } from '@/lib/db'
import { inArray } from 'drizzle-orm'
import { recipes, recipeHistory } from '@/lib/db/schema'
import type { RecipeFilters } from '@/types'

function applyFilters(
  recipes: { recipeId: string; recipeTitle: string; tags: string[]; category: string; totalTimeMinutes: number | null; lastMade: string | null }[],
  filters: RecipeFilters,
) {
  return recipes.filter((r) => {
    if (filters.tags.length > 0 && !filters.tags.every((t) => r.tags.includes(t))) return false
    if (filters.categories.length > 0 && !filters.categories.includes(r.category as RecipeFilters['categories'][number])) return false
    if (filters.maxTotalMinutes !== null && filters.maxTotalMinutes < 240) {
      if (r.totalTimeMinutes === null || r.totalTimeMinutes > filters.maxTotalMinutes) return false
    }
    if (filters.neverMade) {
      if (r.lastMade !== null) return false
    } else {
      if (filters.lastMadeFrom && (r.lastMade === null || r.lastMade < filters.lastMadeFrom)) return false
      if (filters.lastMadeTo && (r.lastMade === null || r.lastMade > filters.lastMadeTo)) return false
    }
    return true
  })
}

export const POST = withAuth(async (req: NextRequest, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, searchRecipesSchema)
  if (parseError) return parseError

  const query = body.query?.trim() ?? ''
  console.log('[recipes/search] query:', query)
  if (!query) {
    return NextResponse.json({ results: [] })
  }

  try {
    const allRecipes = await db
      .select({
        id: recipes.id,
        title: recipes.title,
        category: recipes.category,
        tags: recipes.tags,
        totalTimeMinutes: recipes.totalTimeMinutes,
        ingredients: recipes.ingredients,
      })
      .from(recipes)
      .where(scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, user.id, ctx))

    console.log('[recipes/search] vault size:', allRecipes.length)
    if (allRecipes.length === 0) {
      return NextResponse.json({ results: [] })
    }

    // Fetch lastMade for each recipe
    const recipeIds = allRecipes.map((r) => r.id)
    const history = await db
      .select({ recipeId: recipeHistory.recipeId, madeOn: recipeHistory.madeOn })
      .from(recipeHistory)
      .where(inArray(recipeHistory.recipeId, recipeIds))

    const lastMadeMap: Record<string, string> = {}
    for (const row of history) {
      const current = lastMadeMap[row.recipeId]
      if (!current || row.madeOn > current) {
        lastMadeMap[row.recipeId] = row.madeOn
      }
    }

    // Build compact list for LLM (truncate ingredients to save tokens)
    const compactList = allRecipes
      .map((r) => {
        const ingredients = r.ingredients ? r.ingredients.slice(0, 200) : ''
        return `id:${r.id} | title:${r.title} | tags:${r.tags.join(',')} | ingredients:${ingredients}`
      })
      .join('\n')

    const prompt = `You are a recipe search assistant. Given a user query and a list of recipes, return a JSON array of recipeIds ordered by relevance to the query. Only include recipes that genuinely match. If nothing matches, return [].

Query: "${query}"

Recipes:
${compactList}

Return ONLY a JSON array of recipeId strings, e.g. ["uuid1","uuid2"]. No other text.`

    let rankedIds: string[] = []
    try {
      const rawText = await callLLM({
        model: LLM_MODEL_CAPABLE,
        maxTokens: 512,
        system: 'You are a recipe search assistant. Return only valid JSON arrays.',
        user: prompt,
      })
      const parsed = parseLLMJson<string[]>(rawText)
      rankedIds = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
    } catch {
      rankedIds = []
    }
    console.log('[recipes/search] LLM results:', rankedIds)

    // Security: drop any ID not in the user's recipe list
    const validIdSet = new Set(allRecipes.map((r) => r.id))
    const validRankedIds = rankedIds.filter((id) => validIdSet.has(id))

    // Build candidate set in ranked order with full filter data
    type Candidate = { recipeId: string; recipeTitle: string; tags: string[]; category: string; totalTimeMinutes: number | null; lastMade: string | null }
    const recipeMap = new Map<string, Candidate>(
      allRecipes.map((r) => [r.id, {
        recipeId: r.id,
        recipeTitle: r.title,
        tags: r.tags,
        category: r.category,
        totalTimeMinutes: r.totalTimeMinutes ?? null,
        lastMade: lastMadeMap[r.id] ?? null,
      }])
    )

    let candidates: Candidate[] = validRankedIds.map((id) => recipeMap.get(id)!)

    // Apply filters if provided
    if (body.filters) {
      candidates = applyFilters(candidates, body.filters)
    }

    const results = candidates.map((c) => ({
      recipeId: c.recipeId,
      recipeTitle: c.recipeTitle,
    }))

    return NextResponse.json({ results })
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Failed to search recipes' }, { status: 500 })
  }
})
