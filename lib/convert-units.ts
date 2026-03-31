// Imperial → Metric unit conversion for ingredient lines.

function parseQty(s: string): number {
  const clean = s.replace(/\s+/g, '')
  if (clean.includes('/')) {
    const [n, d] = clean.split('/')
    return parseFloat(n!) / parseFloat(d!)
  }
  return parseFloat(clean)
}

function roundTo(n: number): number {
  if (n < 10) return Math.round(n * 10) / 10
  return Math.round(n)
}

// Grams per cup for common dry/semi-solid ingredients.
// Liquids (water, milk, cream, oil, etc.) are intentionally omitted — they
// fall back to the volume path and are returned in ml.
const CUP_TO_GRAMS: Record<string, number> = {
  'oats': 90,
  'oat': 90,
  'oatmeal': 90,
  'flour': 125,
  'almond flour': 96,
  'sugar': 200,
  'brown sugar': 220,
  'powdered sugar': 120,
  'icing sugar': 120,
  'butter': 227,
  'rice': 185,
  'quinoa': 170,
  'cocoa': 85,
  'cocoa powder': 85,
  'honey': 340,
  'maple syrup': 320,
  'breadcrumbs': 108,
  'panko': 60,
  'cornmeal': 138,
  'cornstarch': 128,
  'baking soda': 230,
  'salt': 273,
  'cheese': 113,
  'parmesan': 100,
  'nuts': 120,
  'walnuts': 117,
  'almonds': 143,
  'pecans': 109,
  'peanuts': 146,
  'chocolate chips': 170,
  'raisins': 165,
  'coconut': 80,
}

// Sort keys longest-first so more-specific entries (e.g. "brown sugar") win
// over shorter ones (e.g. "sugar") when both would match.
const CUP_KEYS_SORTED = Object.keys(CUP_TO_GRAMS).sort((a, b) => b.length - a.length)

function lookupCupDensity(ingredient: string): number | null {
  const lower = ingredient.toLowerCase()
  for (const key of CUP_KEYS_SORTED) {
    if (lower.includes(key)) return CUP_TO_GRAMS[key]!
  }
  return null
}

const QTY = '(\\d+\\s*\\/\\s*\\d+|\\d+\\.?\\d*)'

interface Rule {
  re: RegExp
  convert: (qtyStr: string, rest: string) => string
}

const RULES: Rule[] = [
  // tbsp / tablespoon — always ml (before tsp so "tbsp" doesn't partially match "tsp")
  {
    re: new RegExp(`^${QTY}\\s*(tbsp|tablespoons?)(\\s+.*)?$`, 'i'),
    convert: (q, rest) => {
      const ml = roundTo(parseQty(q) * 14.79)
      return `${ml} ml (${q.trim()} tbsp)${rest}`
    },
  },
  // tsp / teaspoon — always ml
  {
    re: new RegExp(`^${QTY}\\s*(tsp|teaspoons?)(\\s+.*)?$`, 'i'),
    convert: (q, rest) => {
      const ml = roundTo(parseQty(q) * 4.93)
      return `${ml} ml (${q.trim()} tsp)${rest}`
    },
  },
  // cup — density lookup for known dry ingredients; volume fallback (ml) otherwise
  {
    re: new RegExp(`^${QTY}\\s*(cups?)(\\s+.*)?$`, 'i'),
    convert: (q, rest) => {
      const qty = parseQty(q)
      const ingredient = (rest ?? '').trimStart()
      const density = lookupCupDensity(ingredient)
      if (density !== null) {
        const g = roundTo(qty * density)
        return `${g} g${rest}`
      }
      const ml = roundTo(qty * 237)
      return `${ml} ml${rest}`
    },
  },
  // fl oz / fluid oz — always ml
  {
    re: new RegExp(`^${QTY}\\s*(fl\\.?\\s*oz|fluid\\s+oz)(\\s+.*)?$`, 'i'),
    convert: (q, rest) => {
      const ml = roundTo(parseQty(q) * 29.57)
      return `${ml} ml${rest}`
    },
  },
  // oz weight (after fl oz) — grams (weight measure, always correct)
  {
    re: new RegExp(`^${QTY}\\s*(oz|ozs|ounces?)(\\s+.*)?$`, 'i'),
    convert: (q, rest) => {
      const g = roundTo(parseQty(q) * 28.35)
      return `${g} g${rest}`
    },
  },
  // lb / pound — grams (weight measure, always correct)
  {
    re: new RegExp(`^${QTY}\\s*(lbs?|pounds?)(\\s+.*)?$`, 'i'),
    convert: (q, rest) => {
      const g = roundTo(parseQty(q) * 453.59)
      return `${g} g${rest}`
    },
  },
  // inch
  {
    re: new RegExp(`^${QTY}\\s*(inches?|in\\b|\")(\\s+.*)?$`, 'i'),
    convert: (q, rest) => {
      const cm = Math.round(parseQty(q) * 2.54 * 10) / 10
      return `${cm} cm${rest}`
    },
  },
]

export function convertIngredientLine(line: string, to: 'metric' | 'imperial'): string {
  if (to === 'imperial') return line

  // °F anywhere in the line
  const fLine = line.replace(/(\d+(?:\.\d+)?)\s*°?F\b/g, (_, num) => {
    const c = Math.round((parseFloat(num) - 32) * 5 / 9)
    return `${c}°C`
  })
  if (fLine !== line) return fLine

  for (const rule of RULES) {
    const m = line.match(rule.re)
    if (m) {
      const qtyStr = m[1]!
      const rest = m[m.length - 1] ?? ''
      return rule.convert(qtyStr, rest)
    }
  }

  return line
}

export function convertIngredients(ingredients: string, to: 'metric' | 'imperial'): string {
  return ingredients
    .split('\n')
    .map((line) => convertIngredientLine(line, to))
    .join('\n')
}
