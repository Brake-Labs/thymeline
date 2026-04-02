import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { callLLM, LLM_MODEL_CAPABLE, parseLLMJson } from '@/lib/llm'
import { searchRecipesSchema, parseBody } from '@/lib/schemas'
import { scopeQuery } from '@/lib/household'
import type { RecipeFilters } from '@/types'

function applyFilters(
  recipes: { recipe_id: string; recipe_title: string; tags: string[]; category: string; total_time_minutes: number | null; last_made: string | null }[],
  filters: RecipeFilters,
) {
  return recipes.filter((r) => {
    if (filters.tags.length > 0 && !filters.tags.every((t) => r.tags.includes(t))) return false
    if (filters.categories.length > 0 && !filters.categories.includes(r.category as RecipeFilters['categories'][number])) return false
    if (filters.maxTotalMinutes !== null && filters.maxTotalMinutes < 240) {
      if (r.total_time_minutes === null || r.total_time_minutes > filters.maxTotalMinutes) return false
    }
    if (filters.neverMade) {
      if (r.last_made !== null) return false
    } else {
      if (filters.lastMadeFrom && (r.last_made === null || r.last_made < filters.lastMadeFrom)) return false
      if (filters.lastMadeTo && (r.last_made === null || r.last_made > filters.lastMadeTo)) return false
    }
    return true
  })
}

export const POST = withAuth(async (req: NextRequest, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, searchRecipesSchema)
  if (parseError) return parseError

  const query = body.query?.trim() ?? ''
  console.log('[recipes/search] query:', query)
  if (!query) {
    return NextResponse.json({ results: [] })
  }

  const recipesQuery = scopeQuery(db
    .from('recipes')
    .select('id, title, category, tags, total_time_minutes, ingredients'), user.id, ctx)

  const { data: recipes, error: recipesError } = await recipesQuery

  if (recipesError) {
    return NextResponse.json({ error: recipesError.message }, { status: 500 })
  }

  const allRecipes = recipes ?? []
  console.log('[recipes/search] vault size:', allRecipes.length)
  if (allRecipes.length === 0) {
    return NextResponse.json({ results: [] })
  }

  // Fetch last_made for each recipe
  const recipeIds = allRecipes.map((r) => r.id)
  const { data: history } = await db
    .from('recipe_history')
    .select('recipe_id, made_on')
    .in('recipe_id', recipeIds)

  const lastMadeMap: Record<string, string> = {}
  for (const row of history ?? []) {
    const current = lastMadeMap[row.recipe_id]
    if (!current || row.made_on > current) {
      lastMadeMap[row.recipe_id] = row.made_on
    }
  }

  // Build compact list for LLM (truncate ingredients to save tokens)
  const compactList = allRecipes
    .map((r) => {
      const ingredients = r.ingredients ? r.ingredients.slice(0, 200) : ''
      return `id:${r.id} | title:${r.title} | tags:${r.tags.join(',')} | ingredients:${ingredients}`
    })
    .join('\n')

  const prompt = `You are a recipe search assistant. Given a user query and a list of recipes, return a JSON array of recipe_ids ordered by relevance to the query. Only include recipes that genuinely match. If nothing matches, return [].

Query: "${query}"

Recipes:
${compactList}

Return ONLY a JSON array of recipe_id strings, e.g. ["uuid1","uuid2"]. No other text.`

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
  type Candidate = { recipe_id: string; recipe_title: string; tags: string[]; category: string; total_time_minutes: number | null; last_made: string | null }
  const recipeMap = new Map<string, Candidate>(
    allRecipes.map((r) => [r.id, {
      recipe_id: r.id,
      recipe_title: r.title,
      tags: r.tags,
      category: r.category,
      total_time_minutes: r.total_time_minutes ?? null,
      last_made: lastMadeMap[r.id] ?? null,
    }])
  )

  let candidates: Candidate[] = validRankedIds.map((id) => recipeMap.get(id)!)

  // Apply filters if provided
  if (body.filters) {
    candidates = applyFilters(candidates, body.filters)
  }

  const results = candidates.map((c) => ({
    recipe_id: c.recipe_id,
    recipe_title: c.recipe_title,
  }))

  return NextResponse.json({ results })
})
