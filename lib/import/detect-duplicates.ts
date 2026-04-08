import 'server-only'

import { db } from '@/lib/db'
import { recipes as recipesTable } from '@/lib/db/schema'
import { scopeCondition } from '@/lib/household'
import type { HouseholdContext, ParsedRecipe } from '@/types'

export interface DuplicateMatch {
  recipeId:    string
  recipeTitle: string
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
 */
export async function detectDuplicates(
  recipes: ParsedRecipe[],
  _db: unknown,
  userId: string,
  ctx: HouseholdContext | null,
): Promise<Array<DuplicateMatch | null>> {
  if (recipes.length === 0) return []

  // Fetch all vault recipes once
  const vault = await db
    .select({ id: recipesTable.id, title: recipesTable.title, url: recipesTable.url })
    .from(recipesTable)
    .where(scopeCondition({ userId: recipesTable.userId, householdId: recipesTable.householdId }, userId, ctx))

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
        return { recipeId: match.id, recipeTitle: match.title }
      }
    }

    // 2. Title similarity (>= 80%)
    const titleLower = recipe.title.toLowerCase().trim()
    for (const vr of vault) {
      const vrTitleLower = vr.title.toLowerCase().trim()
      if (similarity(titleLower, vrTitleLower) >= 0.8) {
        return { recipeId: vr.id, recipeTitle: vr.title }
      }
    }

    return null
  })
}
