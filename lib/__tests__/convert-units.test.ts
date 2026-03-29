import { describe, it, expect } from 'vitest'
import { convertIngredientLine, convertIngredients } from '../convert-units'

describe('convertIngredientLine — metric', () => {
  it('T01 tsp → ml with parens', () => {
    expect(convertIngredientLine('1 tsp salt', 'metric')).toBe('4.9 ml (1 tsp) salt')
  })

  it('T02 tbsp → ml with parens', () => {
    expect(convertIngredientLine('2 tbsp olive oil', 'metric')).toBe('30 ml (2 tbsp) olive oil')
  })

  it('T03 1 cup → ml without parens', () => {
    expect(convertIngredientLine('1 cup flour', 'metric')).toBe('237 ml flour')
  })

  it('T04 1/2 cup → ml', () => {
    expect(convertIngredientLine('1/2 cup milk', 'metric')).toBe('118 ml milk')
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
})
