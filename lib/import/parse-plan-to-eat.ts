import 'server-only'

import type { ParsedRecipe } from '@/types'
import { FIRST_CLASS_TAGS, BLOCKED_IMPORT_TAGS } from '@/lib/tags'

/** Parse "X min" or "X hour Y min" strings from Plan to Eat time fields */
function parsePteTime(val: string): number | null {
  if (!val || !val.trim()) return null
  const v = val.trim().toLowerCase()

  // "1 hr 30 min" or "1 hour 30 minutes"
  const hm = v.match(/(\d+)\s*h(?:r|our)?s?\s+(\d+)\s*m/)
  if (hm) return parseInt(hm[1]!) * 60 + parseInt(hm[2]!)

  // "30 min"
  const m = v.match(/(\d+)\s*m/)
  if (m) return parseInt(m[1]!)

  // "1 hr"
  const h = v.match(/(\d+)\s*h/)
  if (h) return parseInt(h[1]!) * 60

  const n = parseInt(v)
  return isNaN(n) ? null : n
}

function parseTags(val: string): string[] {
  if (!val) return []
  return val
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !BLOCKED_IMPORT_TAGS.has(t.toLowerCase()))
    .map((t) => {
      const canonical = FIRST_CLASS_TAGS.find((ft) => ft.toLowerCase() === t.toLowerCase())
      return canonical ?? t
    })
    .filter(Boolean)
}

/**
 * Minimal CSV row parser — handles quoted fields with embedded commas and newlines.
 */
function parseRows(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuote = false
  let i = 0

  while (i < content.length) {
    const ch = content[i]!

    if (inQuote) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuote = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuote = true
      } else if (ch === ',') {
        row.push(field)
        field = ''
      } else if (ch === '\n') {
        row.push(field)
        field = ''
        rows.push(row)
        row = []
      } else if (ch === '\r') {
        // skip
      } else {
        field += ch
      }
    }
    i++
  }

  if (field || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/**
 * Parse a Plan to Eat CSV export into ParsedRecipe[].
 * Column mapping is fixed — Plan to Eat format is consistent.
 */
export function parsePlanToEat(content: string): ParsedRecipe[] {
  const rows = parseRows(content)
  if (rows.length < 2) return []

  const headers = rows[0]!.map((h) => h.trim())
  const idx = (name: string) => headers.indexOf(name)

  const results: ParsedRecipe[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!
    if (row.every((cell) => !cell.trim())) continue

    const get = (name: string): string => {
      const j = idx(name)
      return j >= 0 ? (row[j] ?? '').trim() : ''
    }

    const description = get('Description')
    const notes = get('Notes')
    const combinedNotes = description && notes
      ? `${description}\n\n${notes}`
      : description || notes || null

    const url = get('Url')

    const recipe: ParsedRecipe = {
      title:                 get('Name') || '(untitled)',
      category:              null,
      ingredients:           get('Ingredients') || null,
      steps:                 get('Directions') || null,
      notes:                 combinedNotes,
      url:                   url || null,
      imageUrl:             null,
      prepTimeMinutes:     parsePteTime(get('PrepTime')),
      cookTimeMinutes:     parsePteTime(get('CookTime')),
      totalTimeMinutes:    parsePteTime(get('TotalTime')),
      inactiveTimeMinutes: null,
      servings:              parseInt(get('Servings')) || null,
      tags:                  parseTags(get('Tags')),
      source:                url ? 'scraped' : 'manual',
    }

    results.push(recipe)
  }

  return results
}
