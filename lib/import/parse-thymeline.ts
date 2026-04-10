import 'server-only'

import type { ParsedRecipe } from '@/types'
import { FIRST_CLASS_TAGS, BLOCKED_IMPORT_TAGS } from '@/lib/tags'

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

/**
 * Detect whether a JSON string is a Thymeline export.
 * Checks for the `format: 'thymeline'` marker added by the export route.
 */
export function isThymelineJson(content: string): boolean {
  try {
    const parsed = JSON.parse(content)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      parsed.format === 'thymeline' &&
      Array.isArray(parsed.recipes)
    )
  } catch {
    return false
  }
}

/**
 * Parse a Thymeline JSON export into ParsedRecipe[].
 */
export function parseThymeline(content: string): ParsedRecipe[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }

  if (typeof parsed !== 'object' || parsed === null) return []

  const obj = parsed as Record<string, unknown>
  const rawRecipes = Array.isArray(obj['recipes']) ? obj['recipes'] : []

  return rawRecipes
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => {
      const url = typeof r['url'] === 'string' ? r['url'] : null
      const source = r['source']

      return {
        title:               typeof r['title'] === 'string' ? r['title'] : '(untitled)',
        category:            typeof r['category'] === 'string'
          ? (r['category'] as ParsedRecipe['category'])
          : null,
        ingredients:         typeof r['ingredients'] === 'string' ? r['ingredients'] : null,
        steps:               typeof r['steps'] === 'string' ? r['steps'] : null,
        notes:               typeof r['notes'] === 'string' ? r['notes'] : null,
        url,
        imageUrl:            typeof r['image_url'] === 'string' ? r['image_url'] : null,
        prepTimeMinutes:     typeof r['prep_time_minutes'] === 'number' ? r['prep_time_minutes'] : null,
        cookTimeMinutes:     typeof r['cook_time_minutes'] === 'number' ? r['cook_time_minutes'] : null,
        totalTimeMinutes:    typeof r['total_time_minutes'] === 'number' ? r['total_time_minutes'] : null,
        inactiveTimeMinutes: typeof r['inactive_time_minutes'] === 'number' ? r['inactive_time_minutes'] : null,
        servings:            typeof r['servings'] === 'number' ? r['servings'] : null,
        tags:                parseTags(r['tags']),
        source:              source === 'scraped' || source === 'manual' || source === 'generated'
          ? source
          : (url ? 'scraped' : 'manual'),
        stepPhotos:          Array.isArray(r['step_photos']) ? r['step_photos'] : [],
        history:             Array.isArray(r['history'])
          ? (r['history'] as unknown[])
              .filter((h): h is Record<string, unknown> => typeof h === 'object' && h !== null)
              .filter((h) => typeof h['made_on'] === 'string')
              .map((h) => ({ madeOn: h['made_on'] as string }))
          : [],
      } satisfies ParsedRecipe
    })
}
