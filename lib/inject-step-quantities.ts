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
 * E.g. "combine flour and butter" with ingredients "2 cups flour\n1/2 cup butter"
 * → text: "combine 2 cups flour and 1/2 cup butter"
 *   highlights: [{start:8, end:14}, {start:25, end:32}]
 */
export function injectStepQuantities(
  stepText: string,
  ingredients: string,
  servings: number,
  originalServings: number,
): InjectedStep {
  const lines = ingredients.split('\n').filter(Boolean)
  if (lines.length === 0) return { text: stepText, highlights: [] }

  const scaled = scaleIngredients(ingredients, originalServings, servings)

  type Entry = { name: string; quantity: string }
  const entries: Entry[] = lines
    .map((line, i) => {
      const { rawName } = parseIngredientLine(line)
      if (!rawName) return null
      const scaledLine = scaled[i] ?? line
      // quantity = everything before rawName in the scaled line
      const idx = scaledLine.indexOf(rawName)
      const quantity = idx > 0 ? scaledLine.slice(0, idx).trim() : ''
      return { name: rawName, quantity }
    })
    .filter((e): e is Entry => e !== null)

  // Longer names first to prevent partial-match clobbering
  entries.sort((a, b) => b.name.length - a.name.length)

  type Match = { start: number; end: number; quantity: string; matched: string }
  const matches: Match[] = []

  for (const { name, quantity } of entries) {
    const re = new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(stepText)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, quantity, matched: m[0] })
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

  // Build modified text + highlight ranges for the quantity portions
  let result = ''
  let cursor = 0
  const highlights: HighlightRange[] = []

  for (const match of deduped) {
    result += stepText.slice(cursor, match.start)
    if (match.quantity) {
      const qStart = result.length
      result += match.quantity
      highlights.push({ start: qStart, end: result.length })
      result += ' '
    }
    result += match.matched
    cursor = match.end
  }
  result += stepText.slice(cursor)

  return { text: result, highlights }
}
