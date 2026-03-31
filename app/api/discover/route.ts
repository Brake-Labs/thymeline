import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { resolveHouseholdScope } from '@/lib/household'
import { anthropic } from '@/lib/llm'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import type { DiscoveryResult } from '@/types'

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { query?: string; site_filter?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const query = (body.query ?? '').trim()
  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 })
  }

  const siteFilter = (body.site_filter ?? '').trim()

  try {
    // ── Step 1: Fetch vault context ────────────────────────────────────────────
    const db = createAdminClient()
    const ctx = await resolveHouseholdScope(db, user.id)

    let vaultQuery = db
      .from('recipes')
      .select('title, tags, category')
      .order('created_at', { ascending: false })
      .limit(50)

    if (ctx) {
      vaultQuery = vaultQuery.eq('household_id', ctx.householdId)
    } else {
      vaultQuery = vaultQuery.eq('user_id', user.id)
    }

    const { data: vaultRecipes } = await vaultQuery
    const vaultContext = (vaultRecipes ?? []).map((r) => ({ title: r.title, tags: r.tags }))

    // ── Step 2: Generate search queries ───────────────────────────────────────
    let searchQueries: string[] = [query]
    try {
      const queryGenMsg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
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

      const match = rawText.match(/\[[\s\S]*\]/)
      if (match) {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((s) => typeof s === 'string')) {
          searchQueries = parsed
        }
      }
    } catch (err) {
      console.error('[discover] query-gen failed, using raw query:', err)
    }

    // ── Step 3: Web search ────────────────────────────────────────────────────
    interface RawResult {
      url: string
      title: string
      site_name: string
      description: string | null
    }

    let rawResults: RawResult[] = []
    try {
      const searchMsg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 6 }],
        messages: [
          {
            role: 'user',
            content: `Search for recipes using these queries and return the URLs and titles of real recipe pages you find. Queries: ${JSON.stringify(searchQueries)}. Return a JSON array of { url, title, site_name, description } objects — up to 10 results. Only include URLs that look like actual recipe pages (containing /recipe/, /recipes/, or from known recipe domains). Do not invent URLs.`,
          },
        ],
      })

      const textBlock = searchMsg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('')

      const arrayMatch = textBlock.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        const parsed = JSON.parse(arrayMatch[0])
        if (Array.isArray(parsed)) {
          // Deduplicate by URL, keep up to 10
          const seen = new Set<string>()
          for (const item of parsed) {
            if (item && typeof item.url === 'string' && !seen.has(item.url)) {
              seen.add(item.url)
              rawResults.push({
                url: item.url,
                title: item.title ?? '',
                site_name: item.site_name ?? '',
                description: item.description ?? null,
              })
              if (rawResults.length >= 10) break
            }
          }
        }
      }
    } catch (err) {
      console.error('[discover] web search failed:', err)
      return NextResponse.json({ error: 'Search failed — please try again' }, { status: 500 })
    }

    if (rawResults.length === 0) {
      return NextResponse.json({ results: [] })
    }

    // ── Step 4: Rank, compare against vault, suggest tags ────────────────────
    interface RankedResult extends RawResult {
      suggested_tags: string[]
      vault_match?: {
        similar_recipe_title: string
        similarity: 'exact' | 'similar'
      }
    }

    let rankedResults: RankedResult[] = []
    try {
      const rankMsg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: `You are a recipe assistant. Given search results and a user's recipe vault, rank the results and suggest tags.

User query: "${query}"

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
   - complementary (gap-filler): omit vault_match entirely
4. Return the top 6 results as a JSON array

Return ONLY a JSON array with this shape (no explanation):
[{
  "url": "...",
  "title": "...",
  "site_name": "...",
  "description": "..." or null,
  "suggested_tags": [...],
  "vault_match": { "similar_recipe_title": "...", "similarity": "exact" | "similar" }  // omit if complementary
}]`,
          },
        ],
      })

      const rankText = rankMsg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('')

      const rankMatch = rankText.match(/\[[\s\S]*\]/)
      if (rankMatch) {
        const parsed = JSON.parse(rankMatch[0])
        if (Array.isArray(parsed)) {
          rankedResults = parsed.slice(0, 6)
        }
      }
    } catch (err) {
      console.error('[discover] ranking failed:', err)
      // Fall back to raw results without tags
      rankedResults = rawResults.slice(0, 6).map((r) => ({ ...r, suggested_tags: [] }))
    }

    // ── Step 5: Validate and return ───────────────────────────────────────────
    const firstClassSet = new Set(FIRST_CLASS_TAGS.map((t) => t.toLowerCase()))

    const results: DiscoveryResult[] = rankedResults.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      site_name: r.site_name ?? '',
      description: r.description ?? null,
      suggested_tags: (r.suggested_tags ?? []).filter(
        (t) => typeof t === 'string' && firstClassSet.has(t.toLowerCase())
      ),
      ...(r.vault_match
        ? {
            vault_match: {
              similar_recipe_title: r.vault_match.similar_recipe_title ?? '',
              similarity: r.vault_match.similarity === 'exact' ? 'exact' : 'similar',
            },
          }
        : {}),
    }))

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[discover] unexpected error:', err)
    return NextResponse.json({ error: 'Search failed — please try again' }, { status: 500 })
  }
}
