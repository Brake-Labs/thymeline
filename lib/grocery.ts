import { GroceryItem, GrocerySection, RecipeScale } from '@/types'

function uuidv4(): string {
  return crypto.randomUUID()
}

// ── Known units ───────────────────────────────────────────────────────────────

// Maps full-form and plural unit spellings to their canonical abbreviation.
// This is checked BEFORE KNOWN_UNITS so that "tablespoons" normalizes to "tbsp"
// rather than being treated as part of the ingredient name.
const UNIT_ALIASES: Record<string, string> = {
  tablespoon: 'tbsp', tablespoons: 'tbsp',
  teaspoon:   'tsp',  teaspoons:   'tsp',
  ounce:      'oz',   ounces:      'oz',
  pound:      'lb',   pounds:      'lb',
  gram:       'g',    grams:       'g',
  kilogram:   'kg',   kilograms:   'kg',
  milliliter: 'ml',   milliliters: 'ml',
  liter:      'l',    liters:      'l',
  fluid:      '',     // "fluid ounce" handled below — empty string triggers special case
}

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
      'bacon', 'beef', 'bratwurst', 'chicken', 'chorizo', 'clam', 'cod', 'crab',
      'duck', 'egg', 'fish', 'frankfurter', 'halibut', 'hot dog', 'kielbasa',
      'lamb', 'lobster', 'lunchmeat', 'pepperoni', 'pork', 'prosciutto',
      'salmon', 'salami', 'sausage', 'scallop', 'seitan', 'shrimp', 'steak',
      'tempeh', 'tilapia', 'tofu', 'tuna', 'turkey', 'venison',
    ],
  },
  {
    section: 'Dairy & Eggs',
    keywords: [
      'asiago', 'brie', 'butter', 'camembert', 'cheddar', 'cheese', 'colby',
      'cottage cheese', 'cream', 'cream cheese', 'egg', 'emmental', 'feta',
      'fontina', 'gorgonzola', 'gouda', 'gruyere', 'half and half',
      'havarti', 'heavy cream', 'manchego', 'milk', 'mozzarella', 'parmesan',
      'pecorino', 'provolone', 'ricotta', 'romano', 'sour cream',
      'whipping cream', 'yogurt',
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

// Prep-only adjectives whose presence/absence shouldn't prevent two entries from
// combining ("fresh cilantro" and "cilantro", "grated parmesan" and "parmesan").
const PREP_ADJECTIVE_RE = /^(fresh|raw|grated|shredded|crumbled)\s+/

// Named cheeses where the trailing " cheese" word is redundant and can be stripped
// so "parmesan cheese" and "grated parmesan" both normalize to "parmesan".
// Excludes ambiguous cases: "blue cheese", "swiss cheese", "american cheese",
// "cream cheese", "cottage cheese" — where the qualifier changes meaning.
const CHEESE_STRIP_RE = /^(parmesan|mozzarella|cheddar|feta|brie|gouda|gruyere|gruy[eè]re|provolone|colby|asiago|manchego|gorgonzola|camembert|romano|pecorino|fontina|havarti|emmental|emmentaler)\s+cheese$/

/** Normalize ingredient name for deduplication. */
export function normalizeIngredientName(name: string): string {
  let n = name.trim().toLowerCase()
  // Remove commas so "boneless, skinless chicken breast" matches "boneless skinless chicken breast"
  n = n.replace(/,/g, '')
  // Strip leading prep-only adjectives iteratively ("freshly grated parmesan" → "parmesan")
  let prev = ''
  while (prev !== n) {
    prev = n
    n = n.replace(PREP_ADJECTIVE_RE, '')
  }
  n = singularize(n).replace(/\s+/g, ' ')
  // Strip redundant trailing " cheese" from specific named cheeses:
  // "parmesan cheese" → "parmesan" so it deduplicates with "grated parmesan"
  const cheeseMatch = n.match(CHEESE_STRIP_RE)
  if (cheeseMatch) n = cheeseMatch[1]!
  return n
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

// Water-only ingredients should never appear on a grocery list.
// Matches "water", "hot water", "cold water", "warm water", "ice water",
// "tap water", "sparkling water", "filtered water", "boiling water", etc.
const WATER_ONLY_RE = /^(?:(?:hot|cold|warm|ice|iced|tap|sparkling|filtered|boiling|lukewarm|room[\s-]temperature)\s+)?water$/

/** Whether an ingredient is just water (with optional temperature modifier) — omit from grocery lists. */
export function isWaterIngredient(name: string): boolean {
  return WATER_ONLY_RE.test(name.trim().toLowerCase())
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
  isPantry: boolean
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

  // Extract unit — check aliases first (full forms like "tablespoons"), then abbreviations
  let unit: string | null = null
  const firstWord = remainder.split(/\s+/)[0]?.toLowerCase() ?? ''
  if (firstWord in UNIT_ALIASES) {
    const canonical = UNIT_ALIASES[firstWord]!
    remainder = remainder.slice(firstWord.length).trim()
    if (canonical !== '') {
      unit = canonical
    } else {
      // "fluid" — consume it and look at the next word for "ounce"/"ounces"
      const nextWord = remainder.split(/\s+/)[0]?.toLowerCase() ?? ''
      if (nextWord === 'ounce' || nextWord === 'ounces') {
        unit = 'oz'
        remainder = remainder.slice(nextWord.length).trim()
      }
    }
  } else if (KNOWN_UNITS.has(firstWord)) {
    unit = firstWord
    remainder = remainder.slice(firstWord.length).trim()
  }

  // The rest is the ingredient name — strip leading punctuation/connectors
  let rawName = remainder.replace(/^[,\-–\s]+/, '').trim()

  // Strip trailing prep instructions added after a comma: "cut into pieces",
  // "minced", "diced", etc. These don't belong on a grocery list.
  // Work backwards through comma-separated segments, removing each one that
  // looks like a prep/cooking instruction rather than part of the item name.
  const PREP_SEGMENT_RE = /^\s*(?:about|approximately|finely|roughly|thinly|coarsely|lightly|freshly|cut|chop(?:ped)?|diced?|minced?|sliced?|grated?|shredded?|peeled?|pitted?|halved?|quartered?|trimmed?|rinsed?|drained?|thawed?|softened?|melted?|toasted?|roasted?|julienned?|for\b|to taste|plus more|optional)\b/i
  const parts = rawName.split(',')
  while (parts.length > 1 && PREP_SEGMENT_RE.test(parts[parts.length - 1]!)) {
    parts.pop()
  }
  rawName = parts.join(',').trim()

  const name = normalizeIngredientName(rawName)
  const section = assignSection(name)
  const isPantry = isPantryStaple(name)

  return { raw: line, name, rawName, amount, unit, section, isPantry }
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
        isPantry: parsed.isPantry,
        checked:   false,
        recipes:   [recipeTitle],
      })
      continue
    }

    // Multiple recipes — check if units are compatible
    const units = new Set(group.map((g) => g.parsed.unit))

    // Determine the effective unit set, ignoring null:
    // If the only variation is null vs one specific unit, treat as same-unit
    // (null-unit items contribute recipe names but not amounts).
    const nonNullUnits = new Set(Array.from(units).filter((u): u is string => u !== null))
    const canCombine = units.size === 1 || (nonNullUnits.size === 1 && units.has(null))

    if (canCombine) {
      // Same unit (or all null, or null + one specific unit) →
      // sum amounts for items that have a quantity; null-unit/null-amount items
      // contribute only their recipe name (e.g. "parmesan to taste", "chicken breasts")
      const unit = nonNullUnits.size > 0 ? Array.from(nonNullUnits)[0]! : null
      let total: number | null = null
      const recipeNames: string[] = []
      for (const { parsed, recipeTitle, scaleFactor } of group) {
        if (!recipeNames.includes(recipeTitle)) recipeNames.push(recipeTitle)
        if (parsed.amount !== null) {
          const scaled = parsed.amount * scaleFactor
          total = (total ?? 0) + scaled
        }
      }
      const first = group[0]!.parsed
      // Prefer the shortest display name in the group: "cilantro" over "fresh cilantro",
      // "boneless skinless chicken breast" over "boneless, skinless chicken breast"
      const displayName = group.reduce((best, inp) => {
        const n = inp.parsed.rawName || inp.parsed.name
        return n.length < best.length ? n : best
      }, first.rawName || first.name)
      resolved.push({
        id:        uuidv4(),
        name:      displayName,
        amount:    total !== null ? Math.round(total * 100) / 100 : null,
        unit,
        section:   first.section,
        isPantry: first.isPantry,
        checked:   false,
        recipes:   recipeNames,
      })
      continue
    }

    // Conflicting units (multiple specific units) → ambiguous, send to LLM
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
  const scale = recipeScales.find((s) => s.recipeId === recipeId)
  return scale?.servings ?? planServings
}

// ── Export helpers ────────────────────────────────────────────────────────────

/** Filter items for export: pantry checked=include, non-pantry checked=exclude, bought=exclude */
function filterExportableItems(items: GroceryItem[], onlyUnchecked?: boolean): GroceryItem[] {
  if (!onlyUnchecked) return items
  // Pantry semantics: checked=true means "add to cart" (include).
  // Non-pantry: checked=true means "I already have this" (exclude); bought=true means "Got it" (exclude).
  return items.filter((i) => i.isPantry ? i.checked : !i.checked && !i.bought)
}

/**
 * Build the plain-text share payload for the Web Share API.
 * One item per line, no headers, no bullets — compatible with iOS Reminders.
 */
export function buildPlainTextList(
  items: GroceryItem[],
  options?: { onlyUnchecked?: boolean },
): string {
  const filtered = filterExportableItems(items, options?.onlyUnchecked)
  return filtered
    .map((item) => {
      const amt = item.amount !== null ? `${item.amount} ` : ''
      const unit = item.unit ? `${item.unit} ` : ''
      return `${amt}${unit}${item.name}`
    })
    .join('\n')
}

/**
 * Build an iCalendar (.ics) payload with one VTODO per grocery item.
 * iOS Reminders imports each VTODO as a separate reminder when the file is shared.
 * Uses CRLF line endings as required by RFC 5545.
 */
export function buildICSExport(
  items: GroceryItem[],
  options?: { onlyUnchecked?: boolean },
): string {
  const filtered = filterExportableItems(items, options?.onlyUnchecked)

  const CRLF = '\r\n'
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const vtodos = filtered.map((item) => {
    const amt = item.amount !== null ? `${item.amount} ` : ''
    const unit = item.unit ? `${item.unit} ` : ''
    const summary = `${amt}${unit}${item.name}`
      .replace(/[\r\n]/g, ' ')
      .replace(/[\\;,]/g, (c) => `\\${c}`)
    return [
      'BEGIN:VTODO',
      `DTSTAMP:${stamp}`,
      `UID:${crypto.randomUUID()}@thymeline`,
      `SUMMARY:${summary}`,
      'STATUS:NEEDS-ACTION',
      'END:VTODO',
    ].join(CRLF)
  })

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Thymeline//Grocery List//EN',
    ...vtodos,
    'END:VCALENDAR',
  ].join(CRLF)
}

// ── Apple Shortcuts URL ──────────────────────────────────────────────────────

const SHORTCUT_NAME = 'Thymeline Groceries'

/**
 * Build a shortcuts:// URL that passes grocery items as newline-separated text
 * to an Apple Shortcut. The Shortcut splits by newlines and adds each line
 * as a separate reminder.
 */
/** Maximum URL length for shortcuts:// scheme (conservative limit for OS URL handlers) */
const SHORTCUTS_URL_MAX_LENGTH = 2000

export function buildShortcutsURL(
  items: GroceryItem[],
  options?: { onlyUnchecked?: boolean },
): string {
  const filtered = filterExportableItems(items, options?.onlyUnchecked)
  const prefix = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=`

  // Build text incrementally to stay within URL length limits
  const lines: string[] = []
  for (const item of filtered) {
    const amt = item.amount !== null ? `${item.amount} ` : ''
    const unit = item.unit ? `${item.unit} ` : ''
    const line = `${amt}${unit}${item.name}`
    const candidate = [...lines, line].join('\n')
    if ((prefix + encodeURIComponent(candidate)).length > SHORTCUTS_URL_MAX_LENGTH) break
    lines.push(line)
  }

  return `${prefix}${encodeURIComponent(lines.join('\n'))}`
}

// ── Week helpers (re-exported from date-utils) ───────────────────────────────

export { getMostRecentSunday as getCurrentWeekSunday, addDays, formatDateRange as formatDateRangeLabel, formatWeekRange as formatWeekLabel } from '@/lib/date-utils'

