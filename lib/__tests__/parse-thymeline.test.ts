/**
 * Tests for lib/import/parse-thymeline.ts
 * Covers: Thymeline JSON export/import roundtrip (issue #373)
 */

import { describe, it, expect, vi } from 'vitest'

// Stub server-only before importing the module
vi.mock('server-only', () => ({}))

import { parseThymeline, isThymelineJson } from '../import/parse-thymeline'

const SAMPLE_EXPORT = {
  format: 'thymeline',
  exported_at: '2026-04-08T00:00:00.000Z',
  recipe_count: 1,
  recipes: [
    {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Chicken Parmesan',
      category: 'main_dish',
      ingredients: '1 lb chicken breast\n1 cup marinara\n1 cup mozzarella',
      steps: 'Bread the chicken.\nFry until golden.\nTop with sauce and cheese.\nBake at 400°F.',
      notes: 'Kids love this one',
      servings: 4,
      prep_time_minutes: 15,
      cook_time_minutes: 25,
      total_time_minutes: 40,
      inactive_time_minutes: null,
      tags: ['Comfort', 'Favorite'],
      url: 'https://example.com/chicken-parm',
      image_url: 'https://example.com/chicken-parm.jpg',
      source: 'scraped',
      step_photos: [{ stepIndex: 0, url: 'https://cdn.example.com/photo1.jpg' }],
      created_at: '2026-01-15T12:00:00.000Z',
      history: [
        { made_on: '2026-01-20' },
        { made_on: '2026-03-05' },
      ],
    },
  ],
}

describe('isThymelineJson', () => {
  it('returns true for valid Thymeline export JSON', () => {
    expect(isThymelineJson(JSON.stringify(SAMPLE_EXPORT))).toBe(true)
  })

  it('returns false for Whisk JSON', () => {
    const whisk = [{ name: 'Pasta', ingredients: [] }]
    expect(isThymelineJson(JSON.stringify(whisk))).toBe(false)
  })

  it('returns false for invalid JSON', () => {
    expect(isThymelineJson('not json')).toBe(false)
  })

  it('returns false for JSON without format field', () => {
    const noFormat = { recipes: [] }
    expect(isThymelineJson(JSON.stringify(noFormat))).toBe(false)
  })
})

describe('parseThymeline', () => {
  it('parses all fields from a Thymeline export', () => {
    const result = parseThymeline(JSON.stringify(SAMPLE_EXPORT))

    expect(result).toHaveLength(1)
    const recipe = result[0]!

    expect(recipe.title).toBe('Chicken Parmesan')
    expect(recipe.category).toBe('main_dish')
    expect(recipe.ingredients).toBe('1 lb chicken breast\n1 cup marinara\n1 cup mozzarella')
    expect(recipe.steps).toBe('Bread the chicken.\nFry until golden.\nTop with sauce and cheese.\nBake at 400°F.')
    expect(recipe.notes).toBe('Kids love this one')
    expect(recipe.servings).toBe(4)
    expect(recipe.prepTimeMinutes).toBe(15)
    expect(recipe.cookTimeMinutes).toBe(25)
    expect(recipe.totalTimeMinutes).toBe(40)
    expect(recipe.inactiveTimeMinutes).toBeNull()
    expect(recipe.tags).toEqual(['Comfort', 'Favorite'])
    expect(recipe.url).toBe('https://example.com/chicken-parm')
    expect(recipe.imageUrl).toBe('https://example.com/chicken-parm.jpg')
    expect(recipe.source).toBe('scraped')
    expect(recipe.stepPhotos).toEqual([{ stepIndex: 0, url: 'https://cdn.example.com/photo1.jpg' }])
    expect(recipe.history).toEqual([
      { madeOn: '2026-01-20' },
      { madeOn: '2026-03-05' },
    ])
  })

  it('handles multiple recipes', () => {
    const multi = {
      ...SAMPLE_EXPORT,
      recipe_count: 2,
      recipes: [
        SAMPLE_EXPORT.recipes[0],
        {
          ...SAMPLE_EXPORT.recipes[0],
          title: 'Spaghetti Bolognese',
          category: 'main_dish',
          url: null,
          image_url: null,
          source: 'manual',
        },
      ],
    }

    const result = parseThymeline(JSON.stringify(multi))
    expect(result).toHaveLength(2)
    expect(result[0]!.title).toBe('Chicken Parmesan')
    expect(result[1]!.title).toBe('Spaghetti Bolognese')
    expect(result[1]!.url).toBeNull()
    expect(result[1]!.imageUrl).toBeNull()
    expect(result[1]!.source).toBe('manual')
  })

  it('defaults source to manual when missing and no url', () => {
    const noSource = {
      ...SAMPLE_EXPORT,
      recipes: [{ ...SAMPLE_EXPORT.recipes[0], source: undefined, url: null }],
    }
    const result = parseThymeline(JSON.stringify(noSource))
    expect(result[0]!.source).toBe('manual')
  })

  it('defaults source to scraped when missing but url present', () => {
    const noSource = {
      ...SAMPLE_EXPORT,
      recipes: [{ ...SAMPLE_EXPORT.recipes[0], source: undefined }],
    }
    const result = parseThymeline(JSON.stringify(noSource))
    expect(result[0]!.source).toBe('scraped')
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseThymeline('not json')).toEqual([])
  })

  it('returns empty array for non-object JSON', () => {
    expect(parseThymeline('"hello"')).toEqual([])
  })

  it('handles recipe with all null optional fields', () => {
    const minimal = {
      format: 'thymeline',
      exported_at: '2026-04-08T00:00:00.000Z',
      recipe_count: 1,
      recipes: [
        {
          title: 'Simple Toast',
          category: null,
          ingredients: null,
          steps: null,
          notes: null,
          servings: null,
          prep_time_minutes: null,
          cook_time_minutes: null,
          total_time_minutes: null,
          inactive_time_minutes: null,
          tags: [],
          url: null,
          image_url: null,
          source: 'manual',
          step_photos: [],
          created_at: '2026-04-01T00:00:00.000Z',
        },
      ],
    }

    const result = parseThymeline(JSON.stringify(minimal))
    expect(result).toHaveLength(1)
    expect(result[0]!.title).toBe('Simple Toast')
    expect(result[0]!.category).toBeNull()
    expect(result[0]!.ingredients).toBeNull()
    expect(result[0]!.url).toBeNull()
  })

  it('T03: extracts step_photos from export JSON', () => {
    const result = parseThymeline(JSON.stringify(SAMPLE_EXPORT))
    expect(result[0]!.stepPhotos).toEqual([{ stepIndex: 0, url: 'https://cdn.example.com/photo1.jpg' }])
  })

  it('T04: extracts history entries and converts made_on to madeOn', () => {
    const result = parseThymeline(JSON.stringify(SAMPLE_EXPORT))
    expect(result[0]!.history).toEqual([
      { madeOn: '2026-01-20' },
      { madeOn: '2026-03-05' },
    ])
  })

  it('T05: accepts source: generated and preserves it', () => {
    const generated = {
      ...SAMPLE_EXPORT,
      recipes: [{ ...SAMPLE_EXPORT.recipes[0], source: 'generated' }],
    }
    const result = parseThymeline(JSON.stringify(generated))
    expect(result[0]!.source).toBe('generated')
  })

  it('T06: defaults stepPhotos to [] when field is missing (backward compat)', () => {
    const noPhotos = {
      ...SAMPLE_EXPORT,
      recipes: [{
        ...SAMPLE_EXPORT.recipes[0],
        step_photos: undefined,
      }],
    }
    const result = parseThymeline(JSON.stringify(noPhotos))
    expect(result[0]!.stepPhotos).toEqual([])
  })

  it('T07: defaults history to [] when field is missing (backward compat)', () => {
    const noHistory = {
      ...SAMPLE_EXPORT,
      recipes: [{
        ...SAMPLE_EXPORT.recipes[0],
        history: undefined,
      }],
    }
    const result = parseThymeline(JSON.stringify(noHistory))
    expect(result[0]!.history).toEqual([])
  })

  it('filters out malformed history entries', () => {
    const badHistory = {
      ...SAMPLE_EXPORT,
      recipes: [{
        ...SAMPLE_EXPORT.recipes[0],
        history: [
          { made_on: '2026-01-20' },
          { made_on: 123 },
          'not an object',
          null,
          { no_date: true },
        ],
      }],
    }
    const result = parseThymeline(JSON.stringify(badHistory))
    expect(result[0]!.history).toEqual([{ madeOn: '2026-01-20' }])
  })
})
