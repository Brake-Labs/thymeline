import { describe, it, expect } from 'vitest'
import { convertIngredientLine, convertIngredients } from '../convert-units'

describe('convertIngredientLine — metric', () => {
  it('T01 tsp → ml with parens', () => {
    expect(convertIngredientLine('1 tsp salt', 'metric')).toBe('4.9 ml (1 tsp) salt')
  })

  it('T02 tbsp → ml with parens', () => {
    expect(convertIngredientLine('2 tbsp olive oil', 'metric')).toBe('30 ml (2 tbsp) olive oil')
  })

  it('T03 1 cup flour → g via density lookup', () => {
    expect(convertIngredientLine('1 cup flour', 'metric')).toBe('125 g flour')
  })

  it('T04 1/2 cup milk → ml (liquid volume fallback)', () => {
    expect(convertIngredientLine('1/2 cup milk', 'metric')).toBe('119 ml milk')
  })

  it('T05 oz → g', () => {
    expect(convertIngredientLine('8 oz chicken', 'metric')).toBe('227 g chicken')
  })

  it('T06 lb → g', () => {
    expect(convertIngredientLine('1 lb beef', 'metric')).toBe('454 g beef')
  })

  it('T07 no unit → unchanged', () => {
    expect(convertIngredientLine('2 cloves garlic', 'metric')).toBe('2 cloves garlic')
  })

  it('T08 no quantity → unchanged', () => {
    expect(convertIngredientLine('salt to taste', 'metric')).toBe('salt to taste')
  })

  it('T09 °F → °C', () => {
    expect(convertIngredientLine('350°F', 'metric')).toBe('177°C')
  })

  it('T10 convertIngredients converts all lines', () => {
    const input = '1 tsp salt\n2 tbsp olive oil\n2 cloves garlic'
    const output = '4.9 ml (1 tsp) salt\n30 ml (2 tbsp) olive oil\n2 cloves garlic'
    expect(convertIngredients(input, 'metric')).toBe(output)
  })

  it('T11 imperial returns line unchanged', () => {
    expect(convertIngredientLine('1 cup flour', 'imperial')).toBe('1 cup flour')
  })

  // Cup density lookup tests
  it('T12 2 cups oats → g via density lookup', () => {
    expect(convertIngredientLine('2 cups oats', 'metric')).toBe('180 g oats')
  })

  it('T13 1 cup water → ml (liquid volume fallback)', () => {
    expect(convertIngredientLine('1 cup water', 'metric')).toBe('237 ml water')
  })

  it('T14 1 cup unknown ingredient → ml (volume fallback)', () => {
    expect(convertIngredientLine('1 cup unknown ingredient', 'metric')).toBe('237 ml unknown ingredient')
  })

  it('T15 1/2 cup butter → g via density lookup', () => {
    expect(convertIngredientLine('1/2 cup butter', 'metric')).toBe('114 g butter')
  })

  it('T16 brown sugar matches before sugar (longer key wins)', () => {
    expect(convertIngredientLine('1 cup brown sugar', 'metric')).toBe('220 g brown sugar')
  })

  it('T17 fl oz → ml (never grams)', () => {
    expect(convertIngredientLine('2 fl oz cream', 'metric')).toBe('59 ml cream')
  })
})
