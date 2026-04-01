import { describe, it, expect, vi } from 'vitest'

// parseCsv and parsePlanToEat are synchronous; parsePaprika is async.
// We test the tag filtering behaviour via each parser's public API.

vi.mock('server-only', () => ({}))

import { parseCsv } from '../parse-csv'
import { parseWhisk } from '../parse-whisk'
import { parsePlanToEat } from '../parse-plan-to-eat'

// ── CSV parser ────────────────────────────────────────────────────────────────

describe('parseCsv — tag filtering', () => {
  function csv(tags: string): string {
    return `title,tags\nTest Recipe,"${tags}"`
  }

  it('strips meal-type tags (Breakfast, Lunch, Dinner, Snack, Dessert)', () => {
    const results = parseCsv(csv('Breakfast,Lunch,Dinner,Snack,Dessert'))
    expect(results[0]!.tags).toEqual([])
  })

  it('strips "Healthy"', () => {
    const results = parseCsv(csv('Healthy,Quick'))
    expect(results[0]!.tags).not.toContain('Healthy')
    expect(results[0]!.tags).toContain('Quick')
  })

  it('is case-insensitive for blocked tags', () => {
    const results = parseCsv(csv('BREAKFAST,healthy,DINNER'))
    expect(results[0]!.tags).toEqual([])
  })

  it('keeps non-blocked tags', () => {
    const results = parseCsv(csv('Italian,Quick,Vegan'))
    expect(results[0]!.tags).toContain('Italian')
    expect(results[0]!.tags).toContain('Quick')
    expect(results[0]!.tags).toContain('Vegan')
  })
})

// ── Whisk (JSON) parser ───────────────────────────────────────────────────────

describe('parseWhisk — tag filtering', () => {
  function whiskJson(tags: string[]): string {
    return JSON.stringify([{ name: 'Test Recipe', tags }])
  }

  it('strips meal-type tags', () => {
    const results = parseWhisk(whiskJson(['Breakfast', 'Dinner', 'Snack']))
    expect(results[0]!.tags).toEqual([])
  })

  it('strips "Healthy"', () => {
    const results = parseWhisk(whiskJson(['Healthy', 'Italian']))
    expect(results[0]!.tags).not.toContain('Healthy')
    expect(results[0]!.tags).toContain('Italian')
  })

  it('is case-insensitive for blocked tags', () => {
    const results = parseWhisk(whiskJson(['LUNCH', 'dessert']))
    expect(results[0]!.tags).toEqual([])
  })

  it('keeps non-blocked tags', () => {
    const results = parseWhisk(whiskJson(['Vegan', 'Quick', 'Chicken']))
    expect(results[0]!.tags).toEqual(['Vegan', 'Quick', 'Chicken'])
  })
})

// ── Plan to Eat (CSV) parser ──────────────────────────────────────────────────

describe('parsePlanToEat — tag filtering', () => {
  function ptecsv(tags: string): string {
    return `Name,Tags\nTest Recipe,"${tags}"`
  }

  it('strips meal-type tags', () => {
    const results = parsePlanToEat(ptecsv('Breakfast,Lunch'))
    expect(results[0]!.tags).toEqual([])
  })

  it('strips "Healthy"', () => {
    const results = parsePlanToEat(ptecsv('Healthy,Soup'))
    expect(results[0]!.tags).not.toContain('Healthy')
    expect(results[0]!.tags).toContain('Soup')
  })

  it('keeps non-blocked tags', () => {
    const results = parsePlanToEat(ptecsv('Italian,Quick'))
    expect(results[0]!.tags).toContain('Italian')
    expect(results[0]!.tags).toContain('Quick')
  })
})
