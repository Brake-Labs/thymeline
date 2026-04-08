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


// Detects a quantity-like token (number or fraction + optional unit) at the very
// end of a lookback string — with an optional "of" preposition before the trailing
// whitespace. Used to recognise when a step already contains a partial amount for
// an ingredient so we can highlight it in-place rather than injecting the full total.
// Matches both abbreviated (tsp, tbsp) and full (teaspoon, tablespoon) unit names.
// Groups: [1] = the quantity token without trailing whitespace / "of".
const INLINE_QTY_RE = /((?:\d[\d./]*(?:[\u00bd\u2153\u2154\u00bc\u00be\u2155\u2156\u2157\u2158\u2159\u215a\u215b\u215c\u215d\u215e]|\s*\d+\/\d+)?|[\u00bd\u2153\u2154\u00bc\u00be\u2155\u2156\u2157\u2158\u2159\u215a\u215b\u215c\u215d\u215e])(?:\s+(?:teaspoons?|tablespoons?|tsp|tbsp|cups?|fluid\s+ounces?|fl\.?\s*oz|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|milliliters?|millilitres?|ml|liters?|litres?|l|cloves?|cans?|slices?|pieces?|sprigs?|pinch(?:es)?|handfuls?|bunch(?:es)?|heads?|stalks?|inches?))?)(?:\s+of)?\s+$/i

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
  const primaryEntries: Entry[] = []
  // Collect fallback candidates separately so we can apply two guards before adding them:
  //   1. The full ingredient name must NOT appear in the step text (prevents "sauce" from
  //      shadowing "soy sauce" when both "sauce" and "soy sauce" are in the same step).
  //   2. The fallback last-word must be unambiguous — only one ingredient maps to it
  //      (prevents "sauce" matching when BOTH "soy sauce" and "fish sauce" are ingredients).
  const fallbackCandidates: { entry: Entry; fullRe: RegExp }[] = []
  const fallbackWordCount = new Map<string, number>()

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
    primaryEntries.push({ name: rawName, matchName, ingredientName: rawName, quantity })
    // Prepare last-word fallback for multi-word names (e.g. "olive oil" → "oil",
    // "all-purpose flour" → "flour") so step text that uses only the short form still matches.
    const words = matchName.split(/\s+/)
    if (words.length > 1) {
      const lastWord = words[words.length - 1]!
      const fullRe = new RegExp(`\\b${escapeRegex(matchName)}\\b`, 'i')
      fallbackCandidates.push({ entry: { name: rawName, matchName: lastWord, ingredientName: rawName, quantity }, fullRe })
      fallbackWordCount.set(lastWord, (fallbackWordCount.get(lastWord) ?? 0) + 1)
    }
  }

  const entries: Entry[] = [...primaryEntries]
  for (const { entry, fullRe } of fallbackCandidates) {
    const lastWord = entry.matchName
    // Guard 1: only use fallback when the full name isn't already in the step
    // Guard 2: skip if multiple ingredients share the same fallback word (ambiguous)
    if (!fullRe.test(stepText) && (fallbackWordCount.get(lastWord) ?? 0) <= 1) {
      entries.push(entry)
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
    if (match.quantity) {
      // Look back up to 40 chars before the ingredient name to detect whether
      // the step text already contains a quantity (either exact or partial).
      const lookback = stepText.slice(
        Math.max(0, match.start - 40),
        match.start,
      )
      const exactInLookback = lookback.includes(match.quantity)

      if (!seen.has(key) && !exactInLookback) {
        const inlineMatch = INLINE_QTY_RE.exec(lookback)
        if (inlineMatch) {
          // A different (partial) quantity is already written in the step text.
          // Highlight it in-place instead of injecting the full ingredient total.
          const qtyText = inlineMatch[1]!
          const trailingLen = inlineMatch[0].length - qtyText.length
          const qEnd = result.length - trailingLen
          const qStart = qEnd - qtyText.length
          if (qStart >= 0) highlights.push({ start: qStart, end: qEnd })
        } else {
          // No quantity in the step text — inject the full (scaled) total.
          const qStart = result.length
          result += match.quantity
          highlights.push({ start: qStart, end: result.length })
          result += ' '
        }
      } else if (seen.has(key) && !exactInLookback) {
        // Ingredient was already shown in a prior step but this step writes its own
        // partial amount — highlight it so the cook sees exactly what to use here.
        const inlineMatch = INLINE_QTY_RE.exec(lookback)
        if (inlineMatch) {
          const qtyText = inlineMatch[1]!
          const trailingLen = inlineMatch[0].length - qtyText.length
          const qEnd = result.length - trailingLen
          const qStart = qEnd - qtyText.length
          if (qStart >= 0) highlights.push({ start: qStart, end: qEnd })
        }
      }
      // exactInLookback (cases 2 & 4): exact total already written — no action.
    }
    seen.add(match.ingredientName.toLowerCase())
    result += match.matched
    cursor = match.end
  }
  result += stepText.slice(cursor)

  return { text: result, highlights }
}
