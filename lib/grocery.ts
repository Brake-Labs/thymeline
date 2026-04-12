import { GroceryItem, GrocerySection, RecipeScale } from '@/types'

function uuidv4(): string {
  return crypto.randomUUID()
}

// ── Ingredient synonyms ──────────────────────────────────────────────────────
// Maps alternate names to a canonical form. Applied during normalizeIngredientName()
// AFTER prep-adjective stripping and singularization so the lookup sees clean names.
//
// Explicitly NOT synonyms (per product-owner guidance):
//   scallion ≠ green onion, cilantro ≠ coriander, chicken breast ≠ chicken thigh,
//   Italian sausage ≠ sausage, flour tortilla ≠ corn tortilla,
//   toasted sesame oil ≠ sesame oil, whole milk ≠ milk ≠ 2% milk
const INGREDIENT_SYNONYMS: Record<string, string> = {
  'heavy whipping cream': 'heavy cream',
  'whipping cream':       'heavy cream',
  'sweet pepper':         'bell pepper',
  'capsicum':             'bell pepper',
  'plum tomato':          'roma tomato',
  'garbanzo':             'chickpea',
  'garbanzo bean':        'chickpea',
  'corn starch':          'cornstarch',
  'confectioners sugar':  'powdered sugar',
  'icing sugar':          'powdered sugar',
  'unsweetened chocolate': 'baking chocolate',
  'cream of coconut':     'coconut cream',
  'rocket':               'arugula',
  'aubergine':            'eggplant',
  'courgette':            'zucchini',
  'sugar snap pea':       'snap pea',
  'chinese pea pod':      'snow pea',
  'pak choi':             'bok choy',
  'pak choy':             'bok choy',
  'chili pepper':         'chile pepper',
  'chilli pepper':        'chile pepper',
  'serrano pepper':       'serrano',
  'serrano chile':        'serrano',
  'habanero pepper':      'habanero',
  'poblano pepper':       'poblano',
  'anaheim pepper':       'anaheim',
  'crushed red pepper':   'red pepper flake',
  'red chili flake':      'red pepper flake',
  'coriander seed':       'coriander',
  'italian parsley':      'flat-leaf parsley',
  'mayonnaise':           'mayo',
  'catsup':               'ketchup',
  'semi-sweet chocolate': 'semisweet chocolate',
  'bittersweet chocolate': 'dark chocolate',
  'stock':                'broth',
  'chicken stock':        'chicken broth',
  'beef stock':           'beef broth',
  'vegetable stock':      'vegetable broth',
  'greek-style yogurt':   'greek yogurt',
  'rolled oat':           'oat',
  'old-fashioned oat':    'oat',
  'breadcrumb':           'bread crumb',
}

// ── Unit conversion ──────────────────────────────────────────────────────────
// Converts between common kitchen units so that "2 cups cheese" + "8 oz cheese"
// can be summed deterministically without an LLM call.
// All factors convert FROM the key unit TO oz (weight) or TO a base volume unit.

// Volume conversions — everything normalized to tsp as the base unit
const VOLUME_TO_TSP: Record<string, number> = {
  tsp:  1,
  tbsp: 3,
  cup:  48,
  cups: 48,
  oz:   6,      // fluid oz ≈ 6 tsp (volume context)
  ml:   0.2029, // 1 ml ≈ 0.2029 tsp
  l:    202.9,  // 1 L ≈ 202.9 tsp
}

// Weight conversions — everything normalized to oz as the base unit
const WEIGHT_TO_OZ: Record<string, number> = {
  oz:  1,
  lb:  16,
  lbs: 16,
  g:   0.03527,
  kg:  35.274,
}

/** Check if a unit is a volume unit. */
function isVolumeUnit(unit: string): boolean {
  return unit in VOLUME_TO_TSP
}

/** Check if a unit is a weight unit. */
function isWeightUnit(unit: string): boolean {
  return unit in WEIGHT_TO_OZ
}

/**
 * Try to convert an amount from one unit to another.
 * Returns the converted amount or null if units are incompatible.
 * Only converts within the same measurement system (volume↔volume or weight↔weight).
 */
export function convertUnit(amount: number, fromUnit: string, toUnit: string): number | null {
  // Same unit — no conversion needed
  if (fromUnit === toUnit) return amount

  // Volume → volume
  if (isVolumeUnit(fromUnit) && isVolumeUnit(toUnit)) {
    const inTsp = amount * VOLUME_TO_TSP[fromUnit]!
    return inTsp / VOLUME_TO_TSP[toUnit]!
  }

  // Weight → weight
  if (isWeightUnit(fromUnit) && isWeightUnit(toUnit)) {
    const inOz = amount * WEIGHT_TO_OZ[fromUnit]!
    return inOz / WEIGHT_TO_OZ[toUnit]!
  }

  // Incompatible (volume vs weight, or unknown unit) — cannot convert
  return null
}

/**
 * Pick the most human-friendly unit from a set of compatible units.
 * Prefers larger units to avoid "96 tsp" when "2 cups" reads better.
 */
function pickPreferredUnit(units: string[]): string {
  const VOLUME_PREF = ['cups', 'cup', 'tbsp', 'tsp', 'oz', 'l', 'ml']
  const WEIGHT_PREF = ['lb', 'lbs', 'oz', 'kg', 'g']
  for (const u of VOLUME_PREF) {
    if (units.includes(u)) return u
  }
  for (const u of WEIGHT_PREF) {
    if (units.includes(u)) return u
  }
  return units[0]!
}

// ── Purchase-unit rounding ───────────────────────────────────────────────────
// Round final amounts to natural purchase increments so the list reads like a
// human shopping list ("2 cans" not "1.67 cans", "1 head garlic" not "6 cloves").

interface PurchaseRule {
  match: (name: string, unit: string | null, section: GrocerySection) => boolean
  round: (amount: number, unit: string | null) => { amount: number; unit: string | null }
}

/** Helper: check if unit is a weight unit for purchase rule matching. */
function isPurchaseWeight(unit: string | null): boolean {
  return unit !== null && unit in WEIGHT_TO_OZ
}

/** Round up to the next multiple of `step`. */
function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

const MEAT_RE = /\b(beef|pork|lamb|turkey|sausage|bacon|steak|bratwurst)\b/
const CHEESE_RE = /\b(cheese|cheddar|mozzarella|parmesan|feta|brie|gouda|gruyere|provolone|colby|asiago|manchego|gorgonzola|camembert|romano|pecorino|fontina|havarti|emmental|ricotta)\b/

const PURCHASE_RULES: PurchaseRule[] = [
  // Cans → round up to whole cans
  {
    match: (_name, unit) => unit === 'can' || unit === 'cans',
    round: (amount, _unit) => ({ amount: Math.ceil(amount), unit: amount > 1 ? 'cans' : 'can' }),
  },
  // Butter: 8 tbsp = 1 stick. If ≥ 4 sticks, show in lbs (4 sticks = 1 lb).
  {
    match: (name, _unit) => /\bbutter\b/.test(name.toLowerCase()),
    round: (amount, unit) => {
      if (unit === 'tbsp') {
        const sticks = amount / 8
        if (sticks >= 4) return { amount: Math.ceil(sticks / 4), unit: 'lb' }
        return { amount: Math.ceil(sticks), unit: sticks > 1 ? 'sticks' : 'stick' }
      }
      return { amount: Math.ceil(amount * 10) / 10, unit }
    },
  },
  // Garlic cloves → round up; 1 head ≈ 10 cloves
  {
    match: (name, unit) => /\bgarlic\b/.test(name.toLowerCase()) && (unit === 'clove' || unit === 'cloves'),
    round: (amount, _unit) => {
      if (amount <= 10) return { amount: 1, unit: 'head' }
      return { amount: Math.ceil(amount / 10), unit: 'heads' }
    },
  },
  // ── Shopping-scale rules (spec 26) ────────────────────────────────────────
  // Ground meat → round up to nearest 1 lb
  {
    match: (name, unit) => /\bground\b/.test(name.toLowerCase()) && isPurchaseWeight(unit),
    round: (amount, unit) => {
      const inLb = unit === 'lb' || unit === 'lbs' ? amount : (amount * (WEIGHT_TO_OZ[unit!] ?? 1)) / 16
      return { amount: Math.ceil(inLb), unit: 'lb' }
    },
  },
  // Chicken (bulk) → round up to nearest 0.5 lb
  {
    match: (name, unit) => /\bchicken\b/.test(name.toLowerCase()) && isPurchaseWeight(unit),
    round: (amount, unit) => {
      const inLb = unit === 'lb' || unit === 'lbs' ? amount : (amount * (WEIGHT_TO_OZ[unit!] ?? 1)) / 16
      return { amount: ceilTo(inLb, 0.5), unit: 'lb' }
    },
  },
  // Other meats → round up to nearest 0.5 lb
  {
    match: (name, unit) => MEAT_RE.test(name.toLowerCase()) && isPurchaseWeight(unit),
    round: (amount, unit) => {
      const inLb = unit === 'lb' || unit === 'lbs' ? amount : (amount * (WEIGHT_TO_OZ[unit!] ?? 1)) / 16
      return { amount: ceilTo(inLb, 0.5), unit: 'lb' }
    },
  },
  // Cheese → round up to nearest 8 oz
  {
    match: (name, unit) => CHEESE_RE.test(name.toLowerCase()) && isPurchaseWeight(unit),
    round: (amount, unit) => {
      const inOz = unit === 'oz' ? amount : amount * (WEIGHT_TO_OZ[unit!] ?? 1)
      return { amount: ceilTo(inOz, 8), unit: 'oz' }
    },
  },
  // Eggs → round to nearest half-dozen (minimum 6)
  {
    match: (name, unit) => /\beggs?\b/.test(name.toLowerCase()) && (unit === null || ['piece', 'pieces'].includes(unit)),
    round: (amount, _unit) => ({ amount: Math.max(6, ceilTo(amount, 6)), unit: null }),
  },
  // Produce (count, null unit) → round up to whole number
  {
    match: (_name, unit, section) => section === 'Produce' && unit === null,
    round: (amount, unit) => ({ amount: Math.ceil(amount), unit }),
  },
  // Produce (weight) → round up to nearest 0.5 lb
  {
    match: (_name, unit, section) => section === 'Produce' && isPurchaseWeight(unit),
    round: (amount, unit) => {
      const inLb = unit === 'lb' || unit === 'lbs' ? amount : (amount * (WEIGHT_TO_OZ[unit!] ?? 1)) / 16
      return { amount: ceilTo(inLb, 0.5), unit: 'lb' }
    },
  },
  // Generic: round fractional items up when unit is a count (pieces, slices, etc.)
  {
    match: (_name, unit) => ['piece', 'pieces', 'slice', 'slices', 'bunch', 'head', 'heads', 'sprig', 'sprigs', 'stalk', 'stalks'].includes(unit ?? ''),
    round: (amount, unit) => ({ amount: Math.ceil(amount), unit }),
  },
]

/**
 * Apply purchase-unit rounding to a list of grocery items.
 * Mutates nothing — returns a new array.
 */
export function roundToPurchaseUnits(items: GroceryItem[]): GroceryItem[] {
  return items.map((item) => {
    if (item.amount === null) return item
    for (const rule of PURCHASE_RULES) {
      if (rule.match(item.name, item.unit, item.section)) {
        const { amount, unit } = rule.round(item.amount, item.unit)
        return { ...item, amount: Math.round(amount * 100) / 100, unit }
      }
    }
    return item
  })
}

// ── Pantry staple quantity suppression ────────────────────────────────────────

// Universal staples where quantity is meaningless on a shopping list.
// "Salt" doesn't need "2.5 tsp" — you either have it or you don't.
const SUPPRESS_QUANTITY_STAPLES = new Set([
  'salt', 'black pepper', 'pepper', 'olive oil', 'oil', 'cooking spray',
  'garlic powder', 'onion powder', 'oregano', 'paprika', 'cumin',
  'cinnamon', 'nutmeg', 'cayenne', 'turmeric', 'bay leaf',
])

/**
 * Suppress amounts for universal pantry staples where quantity is noise.
 * Returns a new array — does not mutate.
 */
export function suppressStapleQuantities(items: GroceryItem[]): GroceryItem[] {
  return items.map((item) => {
    const normalized = normalizeIngredientName(item.name)
    if (SUPPRESS_QUANTITY_STAPLES.has(normalized)) {
      return { ...item, amount: null, unit: null }
    }
    return item
  })
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
  // Priority order: Frozen → Canned & Jarred → Beverages → Deli → Pantry (butters) → Proteins → Dairy & Eggs → Bakery → Pantry → Produce
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
    section: 'Beverages',
    keywords: [
      'beer', 'club soda', 'coconut water', 'coffee', 'juice', 'kombucha',
      'lemonade', 'seltzer', 'soda', 'sparkling water', 'tea', 'tonic', 'wine',
    ],
  },
  {
    // Deli must come before Proteins so "rotisserie chicken" → Deli, not Proteins.
    section: 'Deli',
    keywords: [
      'deli meat', 'deli turkey', 'deli ham', 'hummus',
      'prepared salad', 'rotisserie chicken', 'rotisserie',
    ],
  },
  {
    // Pantry-specific multi-word items that would otherwise match Dairy or Produce.
    // Must come before Proteins and Dairy so "peanut butter" → Pantry, not Dairy.
    section: 'Pantry',
    keywords: [
      'almond butter', 'nut butter', 'peanut butter',
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
      'bouillon', 'bread crumb', 'brown sugar', 'cardamom', 'cayenne', 'cereal',
      'cinnamon',
      // Note: 'clove' is the spice (ground cloves); listed before Produce so it wins
      // for "ground cloves" / "clove" (the spice), but "garlic cloves" will also
      // match here via substring — that's a known limitation of keyword matching.
      'clove', 'cocoa', 'coconut oil', 'cooking spray', 'cornstarch', 'cumin',
      'curry', 'dark chocolate', 'dried fruit', 'flour',
      'garlic powder', 'granola', 'honey', 'hot sauce', 'jam', 'jelly',
      'ketchup', 'lard', 'maple syrup', 'mayo', 'molasses', 'mustard',
      'noodle', 'nutmeg', 'oat', 'oil', 'olive oil',
      'onion powder', 'oregano', 'pancake mix', 'paprika',
      'pasta', 'pepper flake', 'powdered sugar', 'rice',
      'salt', 'semisweet chocolate', 'sesame oil', 'soy sauce',
      'spice', 'sugar', 'syrup', 'tahini', 'turmeric', 'vanilla',
      'vinegar', 'worcestershire',
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

// Fresh produce (garlic, onion, peppers) intentionally excluded — they belong in
// Need to Buy, not Pantry. Powder/flake forms are kept since those are dry pantry goods.
const PANTRY_KEYWORDS = new Set([
  'black pepper', 'butter', 'cayenne', 'cinnamon', 'cumin', 'flour',
  'garlic powder', 'honey', 'nutmeg', 'oil', 'olive oil', 'onion powder',
  'oregano', 'paprika', 'pepper flake', 'salt', 'sesame oil', 'soy sauce',
  'sugar', 'turmeric', 'vanilla', 'vinegar',
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
// combining. Applied iteratively so multi-word prefixes collapse:
//   "fresh cilantro" → "cilantro"
//   "grated parmesan" → "parmesan"
//   "boneless skinless chicken breast" → "chicken breast"
//   "minced garlic" → "garlic"
//   "extra virgin olive oil" → "olive oil"
//
// Intentionally excluded — these words are often part of a product name and must
// NOT be stripped:
//   "dried"   — dried cranberries ≠ cranberries (different product)
//   "whole"   — whole milk ≠ milk, whole wheat ≠ wheat (dairy/grain qualifiers)
//   "diced"   — "diced tomatoes" is a common canned product name; stripping would
//               merge it with fresh tomatoes
//   "toasted" — "toasted sesame oil" is a completely distinct product from
//               regular sesame oil (different flavor, different use)
//   "roasted" — "roasted red peppers" (jarred) and "roasted almonds" (packaged
//               snack) are distinct products from their raw counterparts
//   "unsalted" — baking recipes are specific about salt content
//   Greek/low-fat/2% dairy variants — different fat/flavor profiles
const PREP_ADJECTIVE_RE = /^(fresh|raw|grated|shredded|crumbled|chopped|minced|sliced|peeled|pitted|julienned|thawed|softened|melted|cooled|chilled|trimmed|rinsed|drained|halved|quartered|boneless|skinless|extra|virgin|large|medium|small|mini|lean)\s+/

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
  // Strip color/variety modifiers from onions and bell peppers so variants
  // deduplicate: "yellow onion" → "onion", "red bell pepper" → "bell pepper".
  // Intentionally NOT applied to tomatoes (cherry/roma/grape are meaningfully
  // different), tortillas (flour ≠ corn), or milk fat variants (whole/2%/skim).
  n = n.replace(/\b(?:yellow|white|sweet|purple|red|vidalia|spanish)\s+onion\b/, 'onion')
  n = n.replace(/\b(?:red|green|yellow|orange|purple)\s+bell\s+pepper\b/, 'bell pepper')
  // Strip redundant trailing " cheese" from specific named cheeses:
  // "parmesan cheese" → "parmesan" so it deduplicates with "grated parmesan"
  const cheeseMatch = n.match(CHEESE_STRIP_RE)
  if (cheeseMatch) n = cheeseMatch[1]!
  // Apply synonym map — must come last so all other normalization has run first
  if (n in INGREDIENT_SYNONYMS) n = INGREDIENT_SYNONYMS[n]!
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
  const PREP_SEGMENT_RE = /^\s*(?:about|approximately|finely|roughly|thinly|coarsely|lightly|freshly|cut|chop(?:ped)?|diced?|minced?|sliced?|grated?|shredded?|peeled?|pitted?|halved?|quartered?|trimmed?|rinsed?|drained?|thawed?|softened?|melted?|toasted?|roasted?|julienned?|chilled?|cooled?|divided|for\b|to taste|plus more|optional|as needed|if needed|at room temperature|room temperature)\b/i
  const parts = rawName.split(',')
  while (parts.length > 1 && PREP_SEGMENT_RE.test(parts[parts.length - 1]!)) {
    parts.pop()
  }
  rawName = parts.join(',').trim()

  // Strip common trailing qualifiers that appear without a preceding comma
  // ("hot water as needed" → "hot water", "parmesan to serve" → "parmesan")
  rawName = rawName.replace(/\s+(?:to taste|to serve|as needed|if needed|as required|for serving|if desired|optional)$/i, '').trim()

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
        recipeBreakdown: [{
          recipe: recipeTitle,
          amount: scaled !== null ? Math.round(scaled * 100) / 100 : null,
          unit:   parsed.unit,
        }],
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
      const breakdown: import('@/types').RecipeBreakdownEntry[] = []
      for (const { parsed, recipeTitle, scaleFactor } of group) {
        if (!recipeNames.includes(recipeTitle)) recipeNames.push(recipeTitle)
        const scaled = parsed.amount !== null ? Math.round(parsed.amount * scaleFactor * 100) / 100 : null
        breakdown.push({ recipe: recipeTitle, amount: scaled, unit: parsed.unit })
        if (parsed.amount !== null) {
          total = (total ?? 0) + parsed.amount * scaleFactor
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
        // Only mark as pantry if ALL occurrences agree — prefer Need to Buy if any disagrees.
        isPantry: group.every((i) => i.parsed.isPantry),
        checked:   false,
        recipes:   recipeNames,
        recipeBreakdown: breakdown,
      })
      continue
    }

    // Conflicting units — try unit conversion before falling back to LLM
    const nonNullUnitsList = Array.from(nonNullUnits)
    const targetUnit = pickPreferredUnit(nonNullUnitsList)
    let conversionWorked = true
    let convertedTotal: number | null = null
    const convertedRecipeNames: string[] = []
    const convertedBreakdown: import('@/types').RecipeBreakdownEntry[] = []

    for (const { parsed, recipeTitle, scaleFactor } of group) {
      if (!convertedRecipeNames.includes(recipeTitle)) convertedRecipeNames.push(recipeTitle)
      const scaled = parsed.amount !== null ? Math.round(parsed.amount * scaleFactor * 100) / 100 : null
      convertedBreakdown.push({ recipe: recipeTitle, amount: scaled, unit: parsed.unit })
      if (parsed.amount === null || parsed.unit === null) continue
      const converted = convertUnit(parsed.amount * scaleFactor, parsed.unit, targetUnit)
      if (converted === null) {
        conversionWorked = false
        break
      }
      convertedTotal = (convertedTotal ?? 0) + converted
    }

    if (conversionWorked) {
      const first = group[0]!.parsed
      const displayName = group.reduce((best, inp) => {
        const n = inp.parsed.rawName || inp.parsed.name
        return n.length < best.length ? n : best
      }, first.rawName || first.name)
      resolved.push({
        id:        uuidv4(),
        name:      displayName,
        amount:    convertedTotal !== null ? Math.round(convertedTotal * 100) / 100 : null,
        unit:      targetUnit,
        section:   first.section,
        isPantry: group.every((i) => i.parsed.isPantry),
        checked:   false,
        recipes:   convertedRecipeNames,
        recipeBreakdown: convertedBreakdown,
      })
    } else {
      // Truly incompatible (e.g. volume vs weight) → ambiguous, send to LLM
      for (const inp of group) {
        ambiguous.push(inp)
      }
    }
  }

  return { resolved, ambiguous }
}

// ── Final deduplication pass ──────────────────────────────────────────────────

/**
 * Final safety-net dedup on a flat GroceryItem list.
 * Called after combining rule-resolved and LLM-resolved items to catch any
 * remaining same-name duplicates (e.g. when some occurrences of "parmesan"
 * merged in the rule pass and a different-unit occurrence came back from LLM
 * as a separate item).
 *
 * Strategy per group of same-normalized-name items:
 * - Same unit or one unit is null → sum amounts, merge recipe lists
 * - Different units → keep the item with the largest amount (or first), merge recipe lists
 */
export function deduplicateItems(items: GroceryItem[]): GroceryItem[] {
  const byName = new Map<string, GroceryItem[]>()
  for (const item of items) {
    const key = normalizeIngredientName(item.name)
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key)!.push(item)
  }

  const result: GroceryItem[] = []
  for (const [, group] of byName) {
    if (group.length === 1) {
      result.push(group[0]!)
      continue
    }

    // Merge all recipes lists and recipeBreakdown arrays
    const allRecipes = Array.from(new Set(group.flatMap((i) => i.recipes)))
    const allBreakdown = group.flatMap((i) => i.recipeBreakdown ?? [])

    const units = new Set(group.map((i) => i.unit))
    const nonNullUnits = Array.from(units).filter((u): u is string => u !== null)

    // Only mark as pantry if ALL items in the group agree — prevents a single
    // LLM-resolved isPantry:true from pulling a Need-to-Buy item into Pantry.
    const mergedIsPantry = group.every((i) => i.isPantry)

    if (nonNullUnits.length <= 1) {
      // All null or one common unit → sum amounts
      const unit = nonNullUnits[0] ?? null
      let total: number | null = null
      for (const item of group) {
        if (item.amount !== null) {
          total = (total ?? 0) + item.amount
        }
      }
      // Use the item with shortest name (most canonical form) as the base
      const base = group.reduce((a, b) => a.name.length <= b.name.length ? a : b)
      result.push({
        ...base,
        unit,
        amount: total !== null ? Math.round(total * 100) / 100 : null,
        isPantry: mergedIsPantry,
        recipes: allRecipes,
        recipeBreakdown: allBreakdown.length > 0 ? allBreakdown : undefined,
      })
    } else {
      // Multiple distinct units — keep the item with the largest amount as primary,
      // merge recipe lists. (LLM already had a chance to reconcile units.)
      const base = group.reduce((best, item) => {
        if (item.amount === null) return best
        if (best.amount === null) return item
        return item.amount > best.amount ? item : best
      }, group[0]!)
      result.push({
        ...base,
        isPantry: mergedIsPantry,
        recipes: allRecipes,
        recipeBreakdown: allBreakdown.length > 0 ? allBreakdown : undefined,
      })
    }
  }

  return result
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

