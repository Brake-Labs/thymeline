import { callLLM, LLM_MODEL_FAST, parseLLMJsonSafe } from '@/lib/llm'
import { logger } from '@/lib/logger'
import { convertUnit, normalizeIngredientName } from '@/lib/grocery'
import type { GroceryItem, RecipeBreakdownEntry } from '@/types'

// ── Identity rules — items the LLM must NOT merge ───────────────────────────
// Sourced from the product-owner guidance in lib/grocery.ts lines 12-14 and
// the INGREDIENT_SYNONYMS exclusion comments.

export const DO_NOT_MERGE: [string, string][] = [
  ['chicken breast', 'chicken thigh'],
  ['Italian sausage', 'sausage'],
  ['scallion', 'green onion'],
  ['cilantro', 'coriander'],
  ['flour tortilla', 'corn tortilla'],
  ['toasted sesame oil', 'sesame oil'],
  ['whole milk', 'milk'],
  ['whole milk', '2% milk'],
  ['milk', '2% milk'],
]

interface LLMDedupGroup {
  canonical: string
  variants:  string[]
}

/**
 * LLM-assisted deduplication pass. Sends item names to Haiku to catch
 * semantic duplicates the rule-based normalizer missed (e.g. "boneless
 * skinless chicken breast" = "chicken breast").
 *
 * Falls back to returning input unchanged if the LLM call fails.
 */
export async function llmDeduplicateItems(items: GroceryItem[]): Promise<GroceryItem[]> {
  // Not enough items to have meaningful duplicates
  if (items.length <= 3) return items

  const itemNames = items.map((i) => i.name)

  const doNotMergeText = DO_NOT_MERGE
    .map(([a, b]) => `- ${a} ≠ ${b}`)
    .join('\n')

  const systemPrompt = `You are a grocery list deduplicator. Given a list of ingredient names, group items that refer to the same shopping product.

Rules:
- Only merge items that a shopper would buy as the SAME product.
- Only merge. Never split, rename, or add items.
- Each input item must appear in exactly one group.
- Items that have no duplicates should appear as a group of one.

DO NOT merge these — they are distinct items:
${doNotMergeText}

Return ONLY valid JSON matching this schema:
{ "groups": [{ "canonical": "shortest/simplest name", "variants": ["all matching names including canonical"] }] }`

  const userPrompt = `Deduplicate this grocery list:\n${JSON.stringify(itemNames)}`

  try {
    const rawText = await callLLM({
      model: LLM_MODEL_FAST,
      maxTokens: 1024,
      system: systemPrompt,
      user: userPrompt,
    })

    const parsed = parseLLMJsonSafe<{ groups: LLMDedupGroup[] }>(rawText)
    if (!parsed || !Array.isArray(parsed.groups)) {
      logger.warn('LLM dedup returned unparseable response, skipping')
      return items
    }

    return mergeByGroups(items, parsed.groups)
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'LLM dedup failed, returning items unchanged',
    )
    return items
  }
}

/**
 * Merge items based on LLM-identified groups.
 */
function mergeByGroups(items: GroceryItem[], groups: LLMDedupGroup[]): GroceryItem[] {
  // Build a map from variant name → canonical group
  const variantToCanonical = new Map<string, string>()
  for (const group of groups) {
    if (!group.canonical || !Array.isArray(group.variants)) continue
    for (const variant of group.variants) {
      variantToCanonical.set(variant.toLowerCase(), group.canonical)
    }
  }

  // Group items by their canonical name
  const canonicalGroups = new Map<string, GroceryItem[]>()
  const unmatched: GroceryItem[] = []

  for (const item of items) {
    const canonical = variantToCanonical.get(item.name.toLowerCase())
    if (canonical) {
      const key = canonical.toLowerCase()
      if (!canonicalGroups.has(key)) canonicalGroups.set(key, [])
      canonicalGroups.get(key)!.push(item)
    } else {
      unmatched.push(item)
    }
  }

  const result: GroceryItem[] = [...unmatched]

  for (const [canonicalKey, group] of canonicalGroups) {
    if (group.length === 1) {
      result.push(group[0]!)
      continue
    }

    // Find the canonical name from the LLM (preserving case from response)
    const canonicalName = groups.find(
      (g) => g.canonical.toLowerCase() === canonicalKey,
    )?.canonical ?? group[0]!.name

    // Merge amounts — try unit conversion if units differ
    const allRecipes = Array.from(new Set(group.flatMap((i) => i.recipes)))
    const allBreakdown: RecipeBreakdownEntry[] = group.flatMap(
      (i) => i.recipeBreakdown ?? [],
    )

    const units = new Set(group.map((i) => i.unit))
    const nonNullUnits = Array.from(units).filter((u): u is string => u !== null)
    const first = group[0]!

    let mergedAmount: number | null = null
    let mergedUnit: string | null = nonNullUnits[0] ?? null

    if (nonNullUnits.length <= 1) {
      // Same unit or all null → sum directly
      for (const item of group) {
        if (item.amount !== null) {
          mergedAmount = (mergedAmount ?? 0) + item.amount
        }
      }
    } else {
      // Different units — try converting to the first non-null unit
      let conversionWorked = true
      for (const item of group) {
        if (item.amount === null) continue
        if (item.unit === mergedUnit || item.unit === null) {
          mergedAmount = (mergedAmount ?? 0) + item.amount
        } else {
          const converted = convertUnit(item.amount, item.unit, mergedUnit!)
          if (converted !== null) {
            mergedAmount = (mergedAmount ?? 0) + converted
          } else {
            conversionWorked = false
            break
          }
        }
      }
      if (!conversionWorked) {
        // Can't convert (e.g. volume vs weight) — keep the largest-amount item
        // as base. This means smaller amounts from other units are dropped,
        // which could under-count. Acceptable because: (1) truly incompatible
        // units are rare after rule-based dedup, (2) the LLM shouldn't group
        // items with fundamentally different units, and (3) buying too little
        // is better than a crash or nonsense total like "16 oz + 2 cups".
        const base = group.reduce((best, item) => {
          if (item.amount === null) return best
          if (best.amount === null) return item
          return item.amount > best.amount ? item : best
        }, first)
        mergedAmount = base.amount
        mergedUnit = base.unit
      }
    }

    // Use the canonical name from the LLM but keep section/isPantry from the
    // item whose normalized name best matches the canonical
    const bestMatch = group.find(
      (i) => normalizeIngredientName(i.name) === normalizeIngredientName(canonicalName),
    ) ?? first

    result.push({
      ...bestMatch,
      name: canonicalName,
      amount: mergedAmount !== null ? Math.round(mergedAmount * 100) / 100 : null,
      unit: mergedUnit,
      recipes: allRecipes,
      recipeBreakdown: allBreakdown.length > 0 ? allBreakdown : undefined,
      isPantry: group.every((i) => i.isPantry),
    })
  }

  return result
}
