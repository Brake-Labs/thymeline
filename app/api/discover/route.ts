import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { callLLM, callLLMMultimodal, parseLLMJson, LLM_MODEL_CAPABLE } from '@/lib/llm'
import { logger } from '@/lib/logger'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import { scopeCondition } from '@/lib/household'
import { deriveTasteProfile } from '@/lib/taste-profile'
import { detectWasteOverlap } from '@/lib/waste-overlap'
import { fetchCurrentWeekPlan, getPlanWasteBadgeText } from '@/lib/plan-utils'
import { parseBody, discoverSchema } from '@/lib/schemas'
import { db } from '@/lib/db'
import { recipes } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'
import type { DiscoveryResult } from '@/types'
import type { RecipeForOverlap } from '@/lib/waste-overlap'

const DISCOVER_WASTE_TIMEOUT_MS = 5000

export const POST = withAuth(async (req: NextRequest, { user, db: _db, ctx }) => {
  const { data: body, error } = await parseBody(req, discoverSchema)
  if (error) return error

  const { query, siteFilter } = body

  logger.info({ query }, 'discover: query received')

  try {
    // ── Step 1: Fetch vault context + taste profile + current plan ────────────
    const vaultPromise = db
      .select({
        title: recipes.title,
        tags: recipes.tags,
        category: recipes.category,
      })
      .from(recipes)
      .where(scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, user.id, ctx))
      .orderBy(desc(recipes.createdAt))
      .limit(50)

    const [vaultRecipes, tasteProfile, currentPlanRecipes] = await Promise.all([
      vaultPromise,
      deriveTasteProfile(user.id, _db, ctx ?? null).catch(() => null),
      fetchCurrentWeekPlan(user.id, _db, ctx ?? null).catch(() => [] as RecipeForOverlap[]),
    ])
    const vaultContext = vaultRecipes.map((r) => ({ title: r.title, tags: r.tags }))

    // ── Step 2: Generate search queries ───────────────────────────────────────
    let searchQueries: string[] = [query]
    try {
      const rawText = await callLLM({
        model: LLM_MODEL_CAPABLE,
        maxTokens: 512,
        system: 'You generate optimized web search queries for recipe discovery. Return ONLY a JSON array of strings.',
        user: `Generate 2-3 optimized web search query strings to find recipe pages for this request: "${query}"${siteFilter ? `. Each query MUST include "site:${siteFilter}".` : ''}

Extract key ingredients, cooking method, and cuisine style from the request. Return ONLY a JSON array of strings, nothing else. Example: ["chicken stir fry recipe", "easy weeknight chicken stir fry"]`,
      })

      try {
        const parsed = parseLLMJson<string[]>(rawText)
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((s) => typeof s === 'string')) {
          searchQueries = parsed
        }
      } catch {
        // Fall back to raw query — already set as default
      }
    } catch (err) {
      logger.error({ err }, 'discover: query-gen failed, using raw query')
    }

    logger.info({ searchQueries }, 'discover: generated search queries')

    // ── Step 3: Web search ────────────────────────────────────────────────────
    interface RawResult {
      url: string
      title: string
      siteName: string
      description: string | null
    }

    const rawResults: RawResult[] = []
    try {
      logger.info({ model: LLM_MODEL_CAPABLE }, 'discover: starting web search')
      const { text: textBlock, response: searchResponse } = await callLLMMultimodal({
        model: LLM_MODEL_CAPABLE,
        maxTokens: 4096,
        system: 'You are a recipe search assistant.',
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 6 }],
        messages: [
          {
            role: 'user',
            content: `Search for recipes using these queries and return the URLs and titles of real recipe pages you find. Queries: ${JSON.stringify(searchQueries)}. Return a JSON array of { url, title, siteName, description } objects — up to 10 results. Only include URLs that look like actual recipe pages (containing /recipe/, /recipes/, or from known recipe domains). Do not invent URLs.`,
          },
        ],
      })

      logger.debug({ contentBlockCount: searchResponse.content.length }, 'discover: web search response received')

      try {
        const parsed = parseLLMJson<RawResult[]>(textBlock)
        if (Array.isArray(parsed)) {
          const seen = new Set<string>()
          for (const item of parsed) {
            if (item && typeof item.url === 'string' && !seen.has(item.url)) {
              seen.add(item.url)
              rawResults.push({
                url: item.url,
                title: item.title ?? '',
                siteName: item.siteName ?? '',
                description: item.description ?? null,
              })
              if (rawResults.length >= 10) break
            }
          }
        }
      } catch {
        // No parseable results — rawResults stays empty
      }
    } catch (err) {
      logger.error({ err }, 'discover: web search failed')
      return NextResponse.json({ error: 'Search failed — please try again' }, { status: 500 })
    }

    logger.info({ count: rawResults.length }, 'discover: parsed raw results')

    if (rawResults.length === 0) {
      return NextResponse.json({ results: [] })
    }

    // ── Step 4: Rank, compare against vault, suggest tags ────────────────────
    interface RankedResult extends RawResult {
      suggestedTags: string[]
      vaultMatch?: {
        similarRecipeTitle: string
        similarity: 'exact' | 'similar'
      }
    }

    let rankedResults: RankedResult[] = []
    try {
      const tasteSection = (() => {
        const lines: string[] = []
        if (tasteProfile?.mealContext) lines.push(`Household context: ${tasteProfile.mealContext}`)
        if (tasteProfile?.topTags?.length) lines.push(`Favourite styles: ${tasteProfile.topTags.slice(0, 5).join(', ')}`)
        if (tasteProfile?.avoidedTags?.length) lines.push(`Avoid: ${tasteProfile.avoidedTags.join(', ')}`)
        return lines.length > 0 ? `\n${lines.join('\n')}\n` : ''
      })()
      const rankText = await callLLM({
        model: LLM_MODEL_CAPABLE,
        maxTokens: 2048,
        system: 'You are a recipe ranking assistant. Return ONLY valid JSON.',
        user: `You are a recipe assistant. Given search results and a user's recipe vault, rank the results and suggest tags.

User query: "${query}"
${tasteSection}
Search results:
${JSON.stringify(rawResults, null, 2)}

User's vault (most recent 50 recipes):
${JSON.stringify(vaultContext, null, 2)}

Available tags (use ONLY these): ${JSON.stringify(FIRST_CLASS_TAGS)}

Instructions:
1. Rank results by relevance to the query (best match first)
2. For each result, suggest 0-4 tags from the available tags list ONLY
3. For each result, check if it matches anything in the vault:
   - "exact": same title or same URL already in vault
   - "similar": same main ingredient + cooking method as an existing vault recipe
   - complementary (gap-filler): omit vaultMatch entirely
4. Return the top 6 results as a JSON array

Return ONLY a JSON array with this shape (no explanation):
[{
  "url": "...",
  "title": "...",
  "siteName": "...",
  "description": "..." or null,
  "suggestedTags": [...],
  "vaultMatch": { "similarRecipeTitle": "...", "similarity": "exact" | "similar" }
}]`,
      })

      try {
        const parsed = parseLLMJson<RankedResult[]>(rankText)
        if (Array.isArray(parsed)) {
          rankedResults = parsed.slice(0, 6)
        }
      } catch {
        rankedResults = rawResults.slice(0, 6).map((r) => ({ ...r, suggestedTags: [] }))
      }
    } catch (err) {
      logger.error({ err }, 'discover: ranking failed')
      rankedResults = rawResults.slice(0, 6).map((r) => ({ ...r, suggestedTags: [] }))
    }

    logger.debug({ count: rankedResults.length }, 'discover: after LLM ranking')

    // ── Step 4.5: Post-filter recipes that have any avoided tag ─────────────
    if (tasteProfile?.avoidedTags?.length) {
      const avoidedSet = new Set(tasteProfile.avoidedTags.map((t) => t.toLowerCase()))
      rankedResults = rankedResults.filter((r) => {
        const recipeTags = (r.suggestedTags ?? []).map((t) => t.toLowerCase())
        return !recipeTags.some((t) => avoidedSet.has(t))
      })
    }

    // ── Step 5: Validate and return ───────────────────────────────────────────
    const firstClassSet = new Set(FIRST_CLASS_TAGS.map((t) => t.toLowerCase()))

    const results: DiscoveryResult[] = rankedResults.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      siteName: r.siteName ?? '',
      description: r.description ?? null,
      suggestedTags: (r.suggestedTags ?? []).filter(
        (t) => typeof t === 'string' && firstClassSet.has(t.toLowerCase()),
      ),
      ...(r.vaultMatch
        ? {
            vaultMatch: {
              similarRecipeTitle: r.vaultMatch.similarRecipeTitle ?? '',
              similarity: r.vaultMatch.similarity === 'exact' ? 'exact' : 'similar',
            },
          }
        : {}),
    }))

    logger.debug({ count: results.length }, 'discover: after tag validation')

    // ── Step 6: Waste overlap detection ───────────────────────────────────────
    if (currentPlanRecipes.length > 0 && results.length > 0) {
      try {
        const candidateRecipes: RecipeForOverlap[] = results.map((r) => ({
          recipeId: r.url,
          title: r.title,
          ingredients: r.description ?? '',
        }))
        const wasteMap = await Promise.race([
          detectWasteOverlap(candidateRecipes, currentPlanRecipes, callLLM),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), DISCOVER_WASTE_TIMEOUT_MS)
          ),
        ])
        for (const result of results) {
          const matches = wasteMap.get(result.url)
          if (matches && matches.length > 0) {
            result.wasteMatches = matches.map((m) => ({ ingredient: m.ingredient, wasteRisk: m.wasteRisk }))
            result.wasteBadgeText = getPlanWasteBadgeText(matches)
          }
        }
      } catch (err) {
        logger.warn({ err }, 'discover: waste detection skipped')
      }
    }

    return NextResponse.json({ results })
  } catch (err) {
    logger.error({ err }, 'discover: unexpected error')
    return NextResponse.json({ error: 'Search failed — please try again' }, { status: 500 })
  }
})
