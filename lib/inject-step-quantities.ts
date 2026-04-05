import { parseIngredientLine } from '@/lib/grocery'
import { scaleIngredients } from '@/lib/scale-ingredients'

export interface HighlightRange {
  start: number
  end: number
}

export interface InjectedStep {
  text: string
  highlights: HighlightRange[]
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replaces bare ingredient names in a step with their (scaled) quantity + name,
 * and returns highlight ranges marking the quantity portions.
 *
 * Only the FIRST occurrence of each ingredient is annotated — within the step
 * and across steps when the caller passes a shared `seenIngredients` Set.
 *
 * E.g. "combine flour and butter" with ingredients "2 cups flour\n1/2 cup butter"
 * → text: "combine 2 cups flour and 1/2 cup butter"
 *   highlights: [{start:8, end:14}, {start:25, end:32}]
 *
 * @param seenIngredients  Optional shared Set that accumulates ingredient names
 *   across multiple steps. Pass the same Set for every step so each ingredient's
 *   quantity is only shown the first time it appears in the whole recipe.
 *   The Set is mutated in place.
 */
export function injectStepQuantities(
  stepText: string,
  ingredients: string,
  servings: number,
  originalServings: number,
  seenIngredients?: Set<string>,
): InjectedStep {
  const lines = ingredients.split('\n').filter(Boolean)
  if (lines.length === 0) return { text: stepText, highlights: [] }

  const scaled = scaleIngredients(ingredients, originalServings, servings)

  type Entry = { name: string; matchName: string; ingredientName: string; quantity: string }
  const entries: Entry[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const { rawName } = parseIngredientLine(line)
    if (!rawName) continue
    const scaledLine = scaled[i] ?? line
    // quantity = everything before rawName in the scaled line
    const idx = scaledLine.indexOf(rawName)
    const quantity = idx > 0 ? scaledLine.slice(0, idx).trim() : ''
    // Strip comma-separated descriptors so "garlic, minced" matches "garlic" in steps
    const preComma = rawName.includes(',') ? rawName.split(',')[0]!.trim() : rawName
    const matchName = preComma || rawName
    entries.push({ name: rawName, matchName, ingredientName: rawName, quantity })
    // Add last-word fallback for multi-word names (e.g. "olive oil" → "oil",
    // "all-purpose flour" → "flour") so step text that uses only the short form still matches.
    const words = matchName.split(/\s+/)
    if (words.length > 1) {
      const lastWord = words[words.length - 1]!
      entries.push({ name: rawName, matchName: lastWord, ingredientName: rawName, quantity })
    }
  }

  // Longer match names first to prevent partial-match clobbering
  entries.sort((a, b) => b.matchName.length - a.matchName.length)

  type Match = { start: number; end: number; quantity: string; matched: string; matchName: string; ingredientName: string }
  const matches: Match[] = []

  for (const { matchName, ingredientName, quantity } of entries) {
    const re = new RegExp(`\\b${escapeRegex(matchName)}\\b`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(stepText)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, quantity, matched: m[0], matchName, ingredientName })
    }
  }

  if (matches.length === 0) return { text: stepText, highlights: [] }

  // Sort by position, drop overlaps
  matches.sort((a, b) => a.start - b.start)
  const deduped: Match[] = []
  for (const m of matches) {
    if (deduped.length === 0 || m.start >= deduped[deduped.length - 1]!.end) {
      deduped.push(m)
    }
  }

  // Build modified text + highlight ranges for the quantity portions.
  // Use the caller's shared Set (cross-step) or a fresh local one (within-step only).
  // Either way, each ingredient's quantity is injected only on its first occurrence.
  const seen = seenIngredients ?? new Set<string>()

  let result = ''
  let cursor = 0
  const highlights: HighlightRange[] = []

  for (const match of deduped) {
    result += stepText.slice(cursor, match.start)
    const key = match.ingredientName.toLowerCase()
    if (match.quantity && !seen.has(key)) {
      // Don't prepend the quantity if it already appears in the step text immediately
      // before this ingredient (e.g. step says "Add 2 tbsp olive oil" — injecting
      // again would produce "Add 2 tbsp 2 tbsp olive oil").
      // Look back match.quantity.length + 15 chars to accommodate prepositions like
      // "1 cup of flour" where "of" separates the quantity from the ingredient.
      const lookback = stepText.slice(
        Math.max(0, match.start - match.quantity.length - 15),
        match.start,
      )
      if (!lookback.includes(match.quantity)) {
        const qStart = result.length
        result += match.quantity
        highlights.push({ start: qStart, end: result.length })
        result += ' '
      }
    }
    seen.add(match.ingredientName.toLowerCase())
    result += match.matched
    cursor = match.end
  }
  result += stepText.slice(cursor)

  return { text: result, highlights }
}
