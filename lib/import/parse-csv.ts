import 'server-only'

import type { ParsedRecipe } from '@/types'
import { FIRST_CLASS_TAGS, BLOCKED_IMPORT_TAGS } from '@/lib/tags'

/** Fuzzy column name → recipe field map */
const FIELD_ALIASES: Record<string, string[]> = {
  title:                 ['title', 'name', 'recipe name'],
  ingredients:           ['ingredients', 'ingredient list'],
  steps:                 ['steps', 'instructions', 'directions', 'method'],
  notes:                 ['notes', 'description', 'comments'],
  url:                   ['url', 'source url', 'link'],
  tags:                  ['tags', 'categories', 'category'],
  category:              ['category', 'meal type', 'type'],
  servings:              ['servings', 'serves', 'yield'],
  prepTimeMinutes:     ['prep time', 'prep_time', 'preparation time'],
  cookTimeMinutes:     ['cook time', 'cook_time', 'cooking time'],
  totalTimeMinutes:    ['total time', 'total_time'],
}

function mapHeaders(headers: string[], mapping?: Record<string, string>): Record<string, number> {
  const result: Record<string, number> = {}

  if (mapping) {
    // Explicit mapping: csv column name → recipe field
    headers.forEach((header, idx) => {
      const field = mapping[header]
      if (field && field !== '(ignore)') {
        result[field] = idx
      }
    })
    return result
  }

  // Fuzzy auto-mapping
  headers.forEach((header, idx) => {
    const lower = header.trim().toLowerCase()
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.includes(lower) && !(field in result)) {
        result[field] = idx
        break
      }
    }
  })

  return result
}

/** Parse a time string like "45 min", "1h 30m", "1:30", "90" into minutes */
function parseTimeMinutes(val: string): number | null {
  if (!val || !val.trim()) return null
  const v = val.trim().toLowerCase()

  // "1h 30m" or "1 hr 30 min"
  const hm = v.match(/(\d+)\s*h(?:r|our)?s?\s*(?:(\d+)\s*m(?:in)?)?/)
  if (hm) {
    return parseInt(hm[1]!) * 60 + parseInt(hm[2] ?? '0')
  }

  // "30m" or "30 min"
  const m = v.match(/^(\d+)\s*m/)
  if (m) return parseInt(m[1]!)

  // "1:30" → 90
  const colon = v.match(/^(\d+):(\d{2})$/)
  if (colon) return parseInt(colon[1]!) * 60 + parseInt(colon[2]!)

  // Plain integer
  const n = parseInt(v)
  return isNaN(n) ? null : n
}

function parseCategory(val: string): ParsedRecipe['category'] {
  if (!val) return null
  const lower = val.trim().toLowerCase()
  if (lower.includes('breakfast')) return 'breakfast'
  if (lower.includes('dessert')) return 'dessert'
  if (lower.includes('side')) return 'side_dish'
  if (lower === 'main_dish' || lower === 'main dish' || lower === 'main' || lower === 'dinner' || lower === 'lunch') return 'main_dish'
  return null
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

  // Last field/row
  if (field || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/**
 * Parse a generic CSV (or Notion CSV with confirmed mapping) into ParsedRecipe[].
 */
export function parseCsv(
  content: string,
  mapping?: Record<string, string>,
): ParsedRecipe[] {
  const rows = parseRows(content)
  if (rows.length < 2) return []

  const headers = rows[0]!.map((h) => h.trim())
  const fieldIdx = mapHeaders(headers, mapping)

  const results: ParsedRecipe[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!
    if (row.every((cell) => !cell.trim())) continue // skip blank rows

    const get = (field: string): string => {
      const idx = fieldIdx[field]
      return idx !== undefined ? (row[idx] ?? '').trim() : ''
    }

    const title = get('title')

    const recipe: ParsedRecipe = {
      title: title || '(untitled)',
      category:              parseCategory(get('category')),
      ingredients:           get('ingredients') || null,
      steps:                 get('steps') || null,
      notes:                 get('notes') || null,
      url:                   get('url') || null,
      imageUrl:             null,
      prepTimeMinutes:     parseTimeMinutes(get('prepTimeMinutes')),
      cookTimeMinutes:     parseTimeMinutes(get('cookTimeMinutes')),
      totalTimeMinutes:    parseTimeMinutes(get('totalTimeMinutes')),
      inactiveTimeMinutes: null,
      servings:              parseInt(get('servings')) || null,
      tags:                  parseTags(get('tags')),
      source:                get('url') ? 'scraped' : 'manual',
      stepPhotos:            [],
      history:               [],
    }

    if (!title) {
      results.push({ ...recipe, title: '' })
    } else {
      results.push(recipe)
    }
  }

  return results
}
