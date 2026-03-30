import { GroceryItem, GrocerySection, RecipeScale } from '@/types'

function uuidv4(): string {
  return crypto.randomUUID()
}

// ── Known units ───────────────────────────────────────────────────────────────

const KNOWN_UNITS = new Set([
  'tsp', 'tbsp', 'cup', 'cups', 'oz', 'lb', 'lbs', 'g', 'kg', 'ml', 'l',
  'clove', 'cloves', 'can', 'cans', 'slice', 'slices', 'piece', 'pieces',
  'sprig', 'sprigs', 'pinch', 'handful', 'bunch', 'head', 'heads',
  'stalk', 'stalks', 'inch', 'inches',
])

// ── Section assignment ────────────────────────────────────────────────────────

// Whole-word canned/jar indicator regex — matched before the keyword table so that
// any ingredient string containing one of these words is assigned to Canned & Jarred
// regardless of the ingredient name (e.g. "2 cans fire roasted diced tomatoes").
// Word boundaries prevent false matches on "pecan", "toucan", "scan", etc.
const CANNED_INDICATOR_RE = /\b(can|cans|canned|jar|jars|jarred|tin|tins|tinned)\b/

const SECTION_KEYWORDS: { section: GrocerySection; keywords: string[] }[] = [
  // Priority order: Frozen → Canned & Jarred → Proteins → Dairy & Eggs → Bakery → Pantry → Produce
  // Frozen and Canned must come before Produce to avoid mis-classifying frozen/canned items.
  {
    section: 'Frozen',
    keywords: [
      'frozen corn', 'frozen pea', 'frozen spinach', 'frozen vegetable',
      'frozen fruit', 'frozen', 'ice cream', 'sorbet',
    ],
  },
  {
    section: 'Canned & Jarred',
    // These specific phrases catch canned items whose unit indicator ("can"/"cans") may have
    // been stripped by the ingredient parser before assignSection is called.
    keywords: [
      'canned artichoke', 'canned bean', 'canned corn', 'canned lentil',
      'canned tomato', 'canned tuna', 'canned salmon', 'canned chickpea',
      'canned kidney bean', 'canned black bean',
      'fire roasted', 'diced tomato', 'crushed tomato',
      'coconut milk', 'tomato paste', 'tomato sauce', 'jarred sauce',
      'roasted pepper', 'sun-dried tomato',
      'broth', 'stock', 'salsa', 'pickle', 'pumpkin puree', 'olives',
    ],
  },
  {
    section: 'Proteins',
    keywords: [
      'bacon', 'beef', 'chicken', 'clam', 'cod', 'crab', 'duck', 'egg', 'fish',
      'halibut', 'lamb', 'lobster', 'pork', 'salmon', 'sausage', 'scallop',
      'seitan', 'shrimp', 'steak', 'tempeh', 'tilapia', 'tofu', 'tuna', 'turkey',
    ],
  },
  {
    section: 'Dairy & Eggs',
    keywords: [
      'butter', 'cheese', 'cottage cheese', 'cream', 'cream cheese', 'egg',
      'half and half', 'heavy cream', 'milk', 'mozzarella', 'parmesan',
      'ricotta', 'sour cream', 'whipping cream', 'yogurt',
    ],
  },
  {
    section: 'Bakery',
    keywords: [
      'bagel', 'baguette', 'bun', 'ciabatta', 'cornbread', 'croissant',
      'english muffin', 'flatbread', 'naan', 'pita', 'roll', 'sourdough bread',
      'tortilla', 'wrap', 'bread',
    ],
  },
  {
    section: 'Pantry',
    keywords: [
      'almond flour', 'baking powder', 'baking soda', 'bay leaf', 'black pepper',
      'bouillon', 'bread crumb', 'brown sugar', 'cardamom', 'cayenne', 'cinnamon',
      'clove', 'cocoa', 'cooking spray', 'cornstarch', 'cumin', 'curry', 'flour',
      'honey', 'hot sauce', 'lard', 'maple syrup', 'molasses', 'mustard',
      'noodle', 'nutmeg', 'oat', 'oil', 'olive oil', 'oregano', 'paprika',
      'pasta', 'pepper flake', 'rice', 'salt', 'sesame oil', 'soy sauce',
      'spice', 'sugar', 'tahini', 'turmeric', 'vanilla', 'vinegar', 'worcestershire',
    ],
  },
  {
    section: 'Produce',
    keywords: [
      'apple', 'avocado', 'banana', 'basil', 'bean sprout', 'beet', 'bell pepper',
      'broccoli', 'cabbage', 'carrot', 'cauliflower', 'celery', 'cherry', 'chili',
      'cilantro', 'corn', 'cucumber', 'dill', 'eggplant', 'fennel', 'fig',
      'garlic', 'ginger', 'grape', 'green bean', 'green onion', 'herbs', 'jalapeño',
      'kale', 'leek', 'lemon', 'lettuce', 'lime', 'mango', 'mint', 'mushroom',
      'onion', 'orange', 'parsley', 'parsnip', 'pea', 'peach', 'pear', 'pepper',
      'pineapple', 'plum', 'potato', 'pumpkin', 'radish', 'rosemary', 'sage',
      'scallion', 'shallot', 'spinach', 'squash', 'strawberry', 'sweet potato',
      'thyme', 'tomato', 'turnip', 'zucchini',
    ],
  },
]

// ── Pantry staple detection ───────────────────────────────────────────────────

const PANTRY_KEYWORDS = new Set([
  'black pepper', 'butter', 'cayenne', 'cinnamon', 'cumin', 'flour', 'garlic',
  'honey', 'nutmeg', 'oil', 'olive oil', 'onion', 'oregano', 'paprika',
  'pepper', 'salt', 'sesame oil', 'soy sauce', 'sugar', 'turmeric', 'vanilla',
  'vinegar',
])

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Singularize simple plurals. Handles common ingredient word forms. */
function singularize(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y'
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes')) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1)
  return word
}

/** Normalize ingredient name for deduplication. */
export function normalizeIngredientName(name: string): string {
  return singularize(name.trim().toLowerCase()).replace(/\s+/g, ' ')
}

/** Assign a GrocerySection from the ingredient name. */
export function assignSection(name: string): GrocerySection {
  const lc = name.toLowerCase()
  // If a canned/jar indicator word is present (whole-word match), short-circuit
  // to Canned & Jarred before the keyword table runs — this catches cases like
  // "2 cans fire roasted diced tomatoes" where "tomato" would otherwise match Produce.
  if (CANNED_INDICATOR_RE.test(lc)) return 'Canned & Jarred'
  for (const { section, keywords } of SECTION_KEYWORDS) {
    if (keywords.some((kw) => lc.includes(kw))) return section
  }
  return 'Other'
}

/** Whether a name matches pantry staple keywords. */
export function isPantryStaple(name: string): boolean {
  const lc = name.toLowerCase()
  return Array.from(PANTRY_KEYWORDS).some((kw) => lc.includes(kw))
}

// ── Amount parsing ────────────────────────────────────────────────────────────

/** Parse a fraction like "1/2" or "1½" to a number. */
function parseFraction(s: string): number | null {
  const unicodeFractions: Record<string, number> = {
    '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
    '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6,
    '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
  }
  // Mixed number like "1½" or "1 1/2"
  const mixedMatch = s.match(/^(\d+)\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|(\d+\/\d+))/)
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1]!, 10)
    const frac = mixedMatch[2]!
    if (frac in unicodeFractions) return whole + unicodeFractions[frac]!
    if (frac.includes('/')) {
      const [n, d] = frac.split('/').map(Number)
      return whole + n! / d!
    }
  }
  // Unicode fraction alone
  for (const [sym, val] of Object.entries(unicodeFractions)) {
    if (s === sym) return val
  }
  // Simple fraction
  const fracMatch = s.match(/^(\d+)\/(\d+)$/)
  if (fracMatch) return parseInt(fracMatch[1]!, 10) / parseInt(fracMatch[2]!, 10)
  // Range like "2-3" → take lower
  const rangeMatch = s.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/)
  if (rangeMatch) return parseFloat(rangeMatch[1]!)
  // Plain number
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

// ── Core parser ───────────────────────────────────────────────────────────────

export interface ParsedIngredient {
  raw:       string
  name:      string        // normalized name
  rawName:   string        // original name (before normalization)
  amount:    number | null
  unit:      string | null
  section:   GrocerySection
  is_pantry: boolean
}

/**
 * Parse one ingredient line into amount, unit, and name.
 * E.g. "2 cups chopped onion" → { amount: 2, unit: 'cups', name: 'chopped onion' }
 */
export function parseIngredientLine(line: string): ParsedIngredient {
  let remainder = line.trim()

  // Strip parenthetical notes like "(about 2 oz)" or "(optional)"
  remainder = remainder.replace(/\(.*?\)/g, '').trim()

  // Extract leading amount
  let amount: number | null = null
  const amountPattern = /^(\d+(?:\.\d+)?(?:[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\s+\d+\/\d+)?(?:\/\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*/
  const amountMatch = remainder.match(amountPattern)
  if (amountMatch) {
    amount = parseFraction(amountMatch[1]!.trim())
    remainder = remainder.slice(amountMatch[0].length)
  }

  // Extract unit (must be a known unit as a whole word)
  let unit: string | null = null
  const firstWord = remainder.split(/\s+/)[0]?.toLowerCase() ?? ''
  if (KNOWN_UNITS.has(firstWord)) {
    unit = firstWord
    remainder = remainder.slice(firstWord.length).trim()
  }

  // The rest is the ingredient name — strip leading punctuation/connectors
  const rawName = remainder.replace(/^[,\-–\s]+/, '').trim()
  const name = normalizeIngredientName(rawName)
  const section = assignSection(name)
  const is_pantry = isPantryStaple(name)

  return { raw: line, name, rawName, amount, unit, section, is_pantry }
}

// ── Combine items ─────────────────────────────────────────────────────────────

interface CombineInput {
  parsed:       ParsedIngredient
  recipeTitle:  string
  scaleFactor:  number
}

/**
 * Combine parsed ingredients from multiple recipes into deduplicated GroceryItems.
 * - Same name + same unit → sum amounts
 * - Same name + different units → flag as ambiguous (keep both, pass to LLM)
 * Returns: { resolved: GroceryItem[], ambiguous: CombineInput[] }
 */
export function combineIngredients(inputs: CombineInput[]): {
  resolved:  GroceryItem[]
  ambiguous: CombineInput[]
} {
  // key: normalized name
  const byName = new Map<string, CombineInput[]>()
  for (const inp of inputs) {
    const key = inp.parsed.name
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key)!.push(inp)
  }

  const resolved: GroceryItem[] = []
  const ambiguous: CombineInput[] = []

  for (const [, group] of byName) {
    if (group.length === 1) {
      const { parsed, recipeTitle, scaleFactor } = group[0]!
      const scaled = parsed.amount !== null ? parsed.amount * scaleFactor : null
      resolved.push({
        id:        uuidv4(),
        name:      parsed.rawName || parsed.name,
        amount:    scaled !== null ? Math.round(scaled * 100) / 100 : null,
        unit:      parsed.unit,
        section:   parsed.section,
        is_pantry: parsed.is_pantry,
        checked:   false,
        recipes:   [recipeTitle],
      })
      continue
    }

    // Multiple recipes — check if units are compatible
    const units = new Set(group.map((g) => g.parsed.unit))
    if (units.size === 1) {
      // Same unit (or all null) → sum
      const unit = Array.from(units)[0] ?? null
      let total: number | null = null
      const recipeNames: string[] = []
      let isAmbiguous = false
      for (const { parsed, recipeTitle, scaleFactor } of group) {
        if (!recipeNames.includes(recipeTitle)) recipeNames.push(recipeTitle)
        if (parsed.amount === null) { isAmbiguous = true; break }
        const scaled = parsed.amount * scaleFactor
        total = (total ?? 0) + scaled
      }
      if (!isAmbiguous) {
        const first = group[0]!.parsed
        resolved.push({
          id:        uuidv4(),
          name:      first.rawName || first.name,
          amount:    total !== null ? Math.round(total * 100) / 100 : null,
          unit,
          section:   first.section,
          is_pantry: first.is_pantry,
          checked:   false,
          recipes:   recipeNames,
        })
        continue
      }
    }

    // Conflicting units or nulls → ambiguous, send to LLM
    for (const inp of group) {
      ambiguous.push(inp)
    }
  }

  return { resolved, ambiguous }
}

// ── Scaling ───────────────────────────────────────────────────────────────────

/** Scale a single item's amount. Does not modify checked items. */
export function scaleItem(item: GroceryItem, factor: number): GroceryItem {
  if (item.checked || item.amount === null) return item
  return { ...item, amount: Math.round(item.amount * factor * 100) / 100 }
}

/**
 * Effective people count for a recipe.
 * Uses recipe override if set; falls back to plan-level default.
 */
export function effectiveServings(
  recipeId: string,
  recipeScales: RecipeScale[],
  planServings: number,
): number {
  const scale = recipeScales.find((s) => s.recipe_id === recipeId)
  return scale?.servings ?? planServings
}

// ── Plain text share format ───────────────────────────────────────────────────

/**
 * Build the plain-text share payload for the Web Share API.
 * One item per line, no headers, no bullets — compatible with iOS Reminders.
 * Each newline becomes a separate reminder when pasted or shared.
 */
export function buildPlainTextList(
  items: GroceryItem[],
  _recipeScales: RecipeScale[],
  _planServings: number,
  _weekStart: string,
  options?: { onlyUnchecked?: boolean },
): string {
  const filtered = options?.onlyUnchecked ? items.filter((i) => !i.bought) : items
  return filtered
    .map((item) => {
      const amt = item.amount !== null ? `${item.amount} ` : ''
      const unit = item.unit ? `${item.unit} ` : ''
      return `${amt}${unit}${item.name}`
    })
    .join('\n')
}

// ── Week helpers ──────────────────────────────────────────────────────────────

/** Return the most recent Sunday (or today if Sunday) as "YYYY-MM-DD". */
export function getCurrentWeekSunday(): string {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun
  const diff = day // days back to Sunday
  const sunday = new Date(now)
  sunday.setUTCDate(now.getUTCDate() - diff)
  return sunday.toISOString().slice(0, 10)
}

/** Add N days to a YYYY-MM-DD string and return the new date string. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Format a flexible date range as "Mar 1 – Mar 14". */
export function formatDateRangeLabel(from: string, to: string): string {
  const start = new Date(`${from}T00:00:00Z`)
  const end   = new Date(`${to}T00:00:00Z`)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}

/** Format ISO date range as "Mar 1 – Mar 7". */
export function formatWeekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}
