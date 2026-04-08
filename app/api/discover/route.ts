import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { anthropic, callLLM, parseLLMJson, LLM_MODEL_CAPABLE } from '@/lib/llm'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import { scopeCondition } from '@/lib/household'
import { deriveTasteProfile } from '@/lib/taste-profile'
import { detectWasteOverlap } from '@/lib/waste-overlap'
import { fetchCurrentWeekPlan, getPlanWasteBadgeText } from '@/lib/plan-utils'
import { db } from '@/lib/db'
import { recipes } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'
import type { DiscoveryResult } from '@/types'
import type { RecipeForOverlap } from '@/lib/waste-overlap'

const DISCOVER_WASTE_TIMEOUT_MS = 5000
// Web search requires a model that supports the web_search_20250305 tool — haiku does not.

export const POST = withAuth(async (req: NextRequest, { user, db: _db, ctx }) => {
  let body: { query?: string; siteFilter?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const query = (body.query ?? '').trim()
  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 })
  }

  console.log('[discover] query:', query)

  const siteFilter = (body.siteFilter ?? '').trim()

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
      // These functions accept a db parameter for testability
      deriveTasteProfile(user.id, _db, ctx ?? null).catch(() => null),
      fetchCurrentWeekPlan(user.id, _db, ctx ?? null).catch(() => [] as RecipeForOverlap[]),
    ])
    const vaultContext = vaultRecipes.map((r) => ({ title: r.title, tags: r.tags }))

    // ── Step 2: Generate search queries ───────────────────────────────────────
    let searchQueries: string[] = [query]
    try {
      const queryGenMsg = await anthropic.messages.create({
        model: LLM_MODEL_CAPABLE,
        max_tokens: 512,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: `Generate 2-3 optimized web search query strings to find recipe pages for this request: "${query}"${siteFilter ? `. Each query MUST include "site:${siteFilter}".` : ''}

Extract key ingredients, cooking method, and cuisine style from the request. Return ONLY a JSON array of strings, nothing else. Example: ["chicken stir fry recipe", "easy weeknight chicken stir fry"]`,
          },
        ],
      })

      const rawText = queryGenMsg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('')

      try {
        const parsed = parseLLMJson<string[]>(rawText)
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((s) => typeof s === 'string')) {
          searchQueries = parsed
        }
      } catch {
        // Fall back to raw query — already set as default
      }
    } catch (err) {
      console.error('[discover] query-gen failed, using raw query:', err)
    }

    console.log('[discover] generated search queries:', searchQueries)

    // ── Step 3: Web search ────────────────────────────────────────────────────
    interface RawResult {
      url: string
      title: string
      siteName: string
      description: string | null
    }

    const rawResults: RawResult[] = []
    try {
      console.log('[discover] web search model:', LLM_MODEL_CAPABLE)
      console.log('[discover] web search tool: web_search_20250305')
      const searchMsg = await anthropic.messages.create({
        model: LLM_MODEL_CAPABLE,
        max_tokens: 4096,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 6 }],
        messages: [
          {
            role: 'user',
            content: `Search for recipes using these queries and return the URLs and titles of real recipe pages you find. Queries: ${JSON.stringify(searchQueries)}. Return a JSON array of { url, title, siteName, description } objects — up to 10 results. Only include URLs that look like actual recipe pages (containing /recipe/, /recipes/, or from known recipe domains). Do not invent URLs.`,
          },
        ],
      })

      const textBlock = searchMsg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('')

      console.log('[discover] web search raw results:', JSON.stringify(searchMsg.content, null, 2))

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
      console.error('[discover] web search failed:', err)
      return NextResponse.json({ error: 'Search failed — please try again' }, { status: 500 })
    }

    console.log('[discover] parsed raw results count:', rawResults.length)

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
      const rankMsg = await anthropic.messages.create({
        model: LLM_MODEL_CAPABLE,
        max_tokens: 2048,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: `You are a recipe assistant. Given search results and a user's recipe vault, rank the results and suggest tags.

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
          },
        ],
      })

      const rankText = rankMsg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('')

      try {
        const parsed = parseLLMJson<RankedResult[]>(rankText)
        if (Array.isArray(parsed)) {
          rankedResults = parsed.slice(0, 6)
        }
      } catch {
        rankedResults = rawResults.slice(0, 6).map((r) => ({ ...r, suggestedTags: [] }))
      }
    } catch (err) {
      console.error('[discover] ranking failed:', err)
      rankedResults = rawResults.slice(0, 6).map((r) => ({ ...r, suggestedTags: [] }))
    }

    console.log('[discover] after LLM ranking:', JSON.stringify(rankedResults, null, 2))

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

    console.log('[discover] after tag validation:', JSON.stringify(results, null, 2))

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
        console.warn('[discover] waste detection skipped:', err)
      }
    }

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[discover] unexpected error:', err)
    return NextResponse.json({ error: 'Search failed — please try again' }, { status: 500 })
  }
})
