import 'server-only'

import type { ParsedRecipe } from '@/types'
import { FIRST_CLASS_TAGS, BLOCKED_IMPORT_TAGS } from '@/lib/tags'

/** Parse ISO 8601 duration strings like PT30M, PT1H30M */
function parseDuration(iso: string): number | null {
  if (!iso) return null
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!match) return null
  return (parseInt(match[1] ?? '0') * 60) + parseInt(match[2] ?? '0')
}

function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t): t is string => typeof t === 'string')
    .filter((t) => !BLOCKED_IMPORT_TAGS.has(t.toLowerCase()))
    .map((t) => {
      const canonical = FIRST_CLASS_TAGS.find((ft) => ft.toLowerCase() === t.toLowerCase())
      return canonical ?? t
    })
    .filter(Boolean)
}

function parseIngredients(raw: unknown): string | null {
  if (!raw) return null
  if (typeof raw === 'string') return raw

  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>
          const parts = [obj['quantity'], obj['unit'], obj['name']]
            .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
          return parts.join(' ').trim()
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return null
}

function parseInstructions(raw: unknown): string | null {
  if (!raw) return null
  if (typeof raw === 'string') return raw

  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>
          return typeof obj['text'] === 'string' ? obj['text'] : ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return null
}

/**
 * Parse a Whisk/Samsung Food JSON export into ParsedRecipe[].
 */
export function parseWhisk(content: string): ParsedRecipe[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }

  const rawRecipes: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.['recipes'])
      ? ((parsed as Record<string, unknown>)['recipes'] as unknown[])
      : []

  return rawRecipes
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => {
      const url = typeof r['url'] === 'string' ? r['url'] : null

      return {
        title:                 typeof r['name'] === 'string' ? r['name'] : '(untitled)',
        category:              null,
        ingredients:           parseIngredients(r['ingredients']),
        steps:                 parseInstructions(r['instructions']),
        notes:                 null,
        url,
        imageUrl:             typeof r['image'] === 'string' ? r['image'] : null,
        prepTimeMinutes:     typeof r['prepTime'] === 'string' ? parseDuration(r['prepTime']) : null,
        cookTimeMinutes:     typeof r['cookTime'] === 'string' ? parseDuration(r['cookTime']) : null,
        totalTimeMinutes:    typeof r['totalTime'] === 'string' ? parseDuration(r['totalTime']) : null,
        inactiveTimeMinutes: null,
        servings:              typeof r['servings'] === 'number' ? r['servings'] : null,
        tags:                  parseTags(r['tags']),
        source:                url ? 'scraped' as const : 'manual' as const,
      } satisfies ParsedRecipe
    })
}
