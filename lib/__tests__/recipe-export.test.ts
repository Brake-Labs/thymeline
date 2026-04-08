/**
 * Tests for lib/recipe-export.ts
 * Covers: T23, T24
 */

import { describe, it, expect } from 'vitest'
import { slugify } from '../recipe-export'

describe('slugify', () => {
  it('T23: converts title to lowercase kebab-case', () => {
    expect(slugify('Chicken Parmesan!')).toBe('chicken-parmesan')
  })

  it('T24: handles special characters and multiple spaces', () => {
    expect(slugify('  My Favorite    Recipe!! (v2)  ')).toBe('my-favorite-recipe-v2')
    expect(slugify('Crème Brûlée')).toBe('cr-me-br-l-e')
    expect(slugify('One---Two___Three')).toBe('one-two-three')
    expect(slugify('')).toBe('')
  })
})
