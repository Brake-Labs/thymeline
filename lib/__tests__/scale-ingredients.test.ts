import { describe, it, expect } from 'vitest'
import { formatFraction, scaleIngredients } from '@/lib/scale-ingredients'

// T30-T32: formatFraction
describe('formatFraction', () => {
  it('T32 - returns clean fractions', () => {
    expect(formatFraction(0.25)).toBe('1/4')
    expect(formatFraction(0.5)).toBe('1/2')
    expect(formatFraction(0.75)).toBe('3/4')
    expect(formatFraction(1 / 3)).toBe('1/3')
    expect(formatFraction(2 / 3)).toBe('2/3')
  })

  it('returns integers as strings', () => {
    expect(formatFraction(1)).toBe('1')
    expect(formatFraction(4)).toBe('4')
  })

  it('T31 - handles mixed numbers', () => {
    expect(formatFraction(1.5)).toBe('1 1/2')
    expect(formatFraction(2.25)).toBe('2 1/4')
    expect(formatFraction(3.75)).toBe('3 3/4')
  })

  it('returns 1 decimal for values <= 0.125', () => {
    expect(formatFraction(0.1)).toBe('0.1')
    expect(formatFraction(0.125)).toBe('0.1')
  })

  it('returns 1 decimal for values with no clean fraction', () => {
    expect(formatFraction(0.6)).toBe('0.6')
  })
})

// T13-T15, T30: scaleIngredients
describe('scaleIngredients', () => {
  it('T13 - doubles quantities at 2x', () => {
    const result = scaleIngredients('2 cups flour', 1, 2)
    expect(result).toEqual(['4 cups flour'])
  })

  it('T13 - "2 cups flour" at 2x -> "4 cups flour"', () => {
    const result = scaleIngredients('2 cups flour', 4, 8)
    expect(result).toEqual(['4 cups flour'])
  })

  it('T14 - "1/2 tsp salt" at 2x -> "1 tsp salt"', () => {
    const result = scaleIngredients('1/2 tsp salt', 1, 2)
    expect(result).toEqual(['1 tsp salt'])
  })

  it('T15 - "Salt to taste" -> unchanged', () => {
    const result = scaleIngredients('Salt to taste', 1, 2)
    expect(result).toEqual(['Salt to taste'])
  })

  it('T30 - scaleIngredients doubles quantities at 2x', () => {
    const result = scaleIngredients('3 tbsp olive oil\n1 cup water', 1, 2)
    // parseIngredientLine returns the unit as parsed ("cup"), not pluralized
    expect(result).toEqual(['6 tbsp olive oil', '2 cup water'])
  })

  it('T31 - handles mixed numbers (1 1/2 cups -> 3 cups at 2x)', () => {
    const result = scaleIngredients('1 1/2 cups milk', 1, 2)
    expect(result).toEqual(['3 cups milk'])
  })

  it('handles multiline ingredients', () => {
    const result = scaleIngredients('2 eggs\nSalt and pepper', 1, 2)
    expect(result[0]).toBe('4 eggs')
    expect(result[1]).toBe('Salt and pepper')
  })
})
