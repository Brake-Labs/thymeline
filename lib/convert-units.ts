// Imperial → Metric unit conversion for ingredient lines.

function parseQty(s: string): number {
  const clean = s.replace(/\s+/g, '')
  if (clean.includes('/')) {
    const [n, d] = clean.split('/')
    return parseFloat(n) / parseFloat(d)
  }
  return parseFloat(clean)
}

function roundMl(ml: number): number {
  if (ml < 10) return Math.round(ml * 10) / 10
  return Math.round(ml)
}

function roundG(g: number): number {
  return Math.round(g)
}

const QTY = '(\\d+\\s*\\/\\s*\\d+|\\d+\\.?\\d*)'

interface Rule {
  re: RegExp
  convert: (qtyStr: string, rest: string) => string
}

const RULES: Rule[] = [
  // tbsp / tablespoon (before tsp so "tbsp" doesn't partially match "tsp")
  {
    re: new RegExp(`^${QTY}\\s*(tbsp|tablespoons?)(\\s+.*)?$`, 'i'),
    convert: (q, rest) => {
      const ml = roundMl(parseQty(q) * 14.79)
      return `${ml} ml (${q.trim()} tbsp)${rest}`
    },
  },
  // tsp / teaspoon
  {
    re: new RegExp(`^${QTY}\\s*(tsp|teaspoons?)(\\s+.*)?$`, 'i'),
    convert: (q, rest) => {
      const ml = roundMl(parseQty(q) * 4.93)
      return `${ml} ml (${q.trim()} tsp)${rest}`
    },
  },
  // cup
  {
    re: new RegExp(`^${QTY}\\s*(cups?)(\\s+.*)?$`, 'i'),
    convert: (q, rest) => {
      const ml = roundMl(parseQty(q) * 236.59)
      return `${ml} ml${rest}`
    },
  },
  // fl oz / fluid oz
  {
    re: new RegExp(`^${QTY}\\s*(fl\\.?\\s*oz|fluid\\s+oz)(\\s+.*)?$`, 'i'),
    convert: (q, rest) => {
      const ml = roundMl(parseQty(q) * 29.57)
      return `${ml} ml${rest}`
    },
  },
  // oz weight (after fl oz)
  {
    re: new RegExp(`^${QTY}\\s*(oz|ozs|ounces?)(\\s+.*)?$`, 'i'),
    convert: (q, rest) => {
      const g = roundG(parseQty(q) * 28.35)
      return `${g} g${rest}`
    },
  },
  // lb / pound
  {
    re: new RegExp(`^${QTY}\\s*(lbs?|pounds?)(\\s+.*)?$`, 'i'),
    convert: (q, rest) => {
      const g = roundG(parseQty(q) * 453.59)
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
      const qtyStr = m[1]
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
