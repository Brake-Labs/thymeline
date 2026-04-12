import { parseIngredientLine } from '@/lib/grocery'

const CLEAN_FRACTIONS = [
  { dec: 1 / 4, str: '1/4' },
  { dec: 1 / 3, str: '1/3' },
  { dec: 1 / 2, str: '1/2' },
  { dec: 2 / 3, str: '2/3' },
  { dec: 3 / 4, str: '3/4' },
]
const TOLERANCE = 0.01

export function formatFraction(value: number): string {
  if (Number.isInteger(value)) return String(value)
  const whole = Math.floor(value)
  const frac = value - whole
  if (frac <= 0.125) return value.toFixed(1)
  for (const { dec, str } of CLEAN_FRACTIONS) {
    if (Math.abs(frac - dec) <= TOLERANCE) {
      return whole > 0 ? `${whole} ${str}` : str
    }
  }
  return value.toFixed(1)
}

export interface ScaledIngredient {
  amount: number | null
  unit: string | null
  rawName: string
  formatted: string
}

export function scaleIngredient(
  line: string,
  baseServings: number,
  targetServings: number,
): ScaledIngredient {
  const base = baseServings === 0 ? 1 : baseServings
  const factor = targetServings / base
  const parsed = parseIngredientLine(line)
  if (parsed.amount === null) {
    return { amount: null, unit: null, rawName: parsed.rawName, formatted: line }
  }
  const scaled = parsed.amount * factor
  const formatted = parsed.unit
    ? `${formatFraction(scaled)} ${parsed.unit} ${parsed.rawName}`
    : `${formatFraction(scaled)} ${parsed.rawName}`
  return { amount: scaled, unit: parsed.unit, rawName: parsed.rawName, formatted }
}

export function scaleIngredients(
  ingredients: string,
  baseServings: number,
  targetServings: number,
): string[] {
  const base = baseServings === 0 ? 1 : baseServings
  const factor = targetServings / base
  return ingredients
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parsed = parseIngredientLine(line)
      if (parsed.amount === null) return line
      const scaled = parsed.amount * factor
      const formatted = formatFraction(scaled)
      return parsed.unit
        ? `${formatted} ${parsed.unit} ${parsed.rawName}`
        : `${formatted} ${parsed.rawName}`
    })
}
