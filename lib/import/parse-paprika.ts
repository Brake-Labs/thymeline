import 'server-only'

import JSZip from 'jszip'
import { gunzipSync } from 'zlib'
import type { ParsedRecipe } from '@/types'
import { FIRST_CLASS_TAGS, BLOCKED_IMPORT_TAGS } from '@/lib/tags'

function parsePaprikaTime(val: unknown): number | null {
  if (!val || typeof val !== 'string') return null
  const v = val.trim().toLowerCase()

  // "1 hr 30 min"
  const hrMin = v.match(/(\d+)\s*hr?\s+(\d+)\s*min/)
  if (hrMin) return parseInt(hrMin[1]!) * 60 + parseInt(hrMin[2]!)

  // "45 min"
  const min = v.match(/(\d+)\s*min/)
  if (min) return parseInt(min[1]!)

  // "1 hr"
  const hr = v.match(/(\d+)\s*hr?/)
  if (hr) return parseInt(hr[1]!) * 60

  const n = parseInt(v)
  return isNaN(n) ? null : n
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

/**
 * Parse a Paprika .paprikarecipes file (ZIP of gzip-compressed JSON) into ParsedRecipe[].
 * Must be async — JSZip operations are async.
 */
export async function parsePaprika(buffer: ArrayBuffer): Promise<ParsedRecipe[]> {
  const zip = await JSZip.loadAsync(buffer)
  const results: ParsedRecipe[] = []

  for (const [filename, zipEntry] of Object.entries(zip.files)) {
    if (!filename.endsWith('.paprika')) continue

    let json: Record<string, unknown>
    try {
      const compressed = await zipEntry.async('arraybuffer')
      const decompressed = gunzipSync(Buffer.from(compressed))
      json = JSON.parse(decompressed.toString('utf8')) as Record<string, unknown>
    } catch (err) {
      console.warn('[parsePaprika] Failed to parse entry', filename, err)
      continue
    }

    const url = typeof json['source'] === 'string' ? json['source'] : null

    results.push({
      title:                 typeof json['name'] === 'string' ? json['name'] : '(untitled)',
      category:              null,
      ingredients:           typeof json['ingredients'] === 'string' ? json['ingredients'] : null,
      steps:                 typeof json['directions'] === 'string' ? json['directions'] : null,
      notes:                 typeof json['notes'] === 'string' ? json['notes'] : null,
      url,
      image_url:             null,
      prep_time_minutes:     null,
      cook_time_minutes:     null,
      total_time_minutes:    parsePaprikaTime(json['total_time']),
      inactive_time_minutes: null,
      servings:              parseInt(String(json['servings'] ?? '')) || null,
      tags:                  parseTags(json['categories']),
      source:                url ? 'scraped' : 'manual',
    })
  }

  return results
}
