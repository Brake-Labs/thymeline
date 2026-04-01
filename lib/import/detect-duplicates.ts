import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { HouseholdContext, ParsedRecipe } from '@/types'
import { scopeQuery } from '@/lib/household'

export interface DuplicateMatch {
  recipe_id:    string
  recipe_title: string
}

/** Compute Levenshtein edit distance between two strings (iterative DP) */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length

  // Use two rows to save memory
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array<number>(n + 1)

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1]!
      } else {
        curr[j] = 1 + Math.min(prev[j]!, curr[j - 1]!, prev[j - 1]!)
      }
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[n]!
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

/**
 * Detect duplicate recipes in the user's vault for each item in the parsed array.
 * Returns a parallel array: one entry per ParsedRecipe, null if no duplicate found.
 *
 * Detection steps:
 * 1. URL match — exact URL match → definite duplicate
 * 2. Title similarity — Levenshtein ≥ 80% similarity → likely duplicate
 */
export async function detectDuplicates(
  recipes: ParsedRecipe[],
  db: SupabaseClient,
  userId: string,
  ctx: HouseholdContext | null,
): Promise<Array<DuplicateMatch | null>> {
  if (recipes.length === 0) return []

  // Fetch all vault recipes once
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseQuery = db.from('recipes').select('id, title, url') as any
  const query = scopeQuery(baseQuery, userId, ctx)
  const { data: vaultRecipes } = await query as {
    data: { id: string; title: string; url: string | null }[] | null
  }
  const vault = vaultRecipes ?? []

  // Build a URL→recipe map for fast O(1) lookup
  const urlMap = new Map<string, { id: string; title: string }>()
  for (const r of vault) {
    if (r.url) urlMap.set(r.url.toLowerCase().trim(), { id: r.id, title: r.title })
  }

  return recipes.map((recipe) => {
    // 1. URL match
    if (recipe.url) {
      const match = urlMap.get(recipe.url.toLowerCase().trim())
      if (match) {
        return { recipe_id: match.id, recipe_title: match.title }
      }
    }

    // 2. Title similarity (≥ 80%)
    const titleLower = recipe.title.toLowerCase().trim()
    for (const vr of vault) {
      const vrTitleLower = vr.title.toLowerCase().trim()
      if (similarity(titleLower, vrTitleLower) >= 0.8) {
        return { recipe_id: vr.id, recipe_title: vr.title }
      }
    }

    return null
  })
}
