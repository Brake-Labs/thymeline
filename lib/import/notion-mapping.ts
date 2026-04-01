import 'server-only'

import { callLLM, LLM_MODEL_FAST, parseLLMJsonSafe } from '@/lib/llm'

const RECIPE_FIELDS = [
  'title', 'ingredients', 'steps', 'notes', 'url',
  'tags', 'category', 'servings', 'prep_time', 'cook_time', 'total_time',
  '(ignore)',
] as const

type RecipeField = typeof RECIPE_FIELDS[number]

const FIELD_ALIASES: Record<string, RecipeField> = {
  title: 'title', name: 'title', 'recipe name': 'title',
  ingredients: 'ingredients', 'ingredient list': 'ingredients',
  steps: 'steps', instructions: 'steps', directions: 'steps', method: 'steps',
  notes: 'notes', description: 'notes', comments: 'notes',
  url: 'url', 'source url': 'url', link: 'url',
  tags: 'tags', categories: 'tags',
  category: 'category', 'meal type': 'category', type: 'category',
  servings: 'servings', serves: 'servings', yield: 'servings',
  'prep time': 'prep_time', prep_time: 'prep_time', 'preparation time': 'prep_time',
  'cook time': 'cook_time', cook_time: 'cook_time', 'cooking time': 'cook_time',
  'total time': 'total_time', total_time: 'total_time',
}

function fuzzyMap(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const header of headers) {
    const lower = header.trim().toLowerCase()
    result[header] = FIELD_ALIASES[lower] ?? '(ignore)'
  }
  return result
}

/**
 * Use an LLM to suggest column-to-field mappings for a Notion CSV export.
 * Falls back to fuzzy matching if the LLM call fails.
 */
export async function suggestNotionMapping(
  headers: string[],
  sampleRows: string[][],
): Promise<Record<string, string>> {
  const fieldList = RECIPE_FIELDS.join(' | ')
  const sampleText = sampleRows
    .slice(0, 2)
    .map((row) => headers.map((h, i) => `${h}: ${row[i] ?? ''}`).join(', '))
    .join('\n')

  const systemPrompt = `You are a data mapping assistant. Given CSV column names and sample rows from a Notion export, map each column to the most appropriate recipe field. Return ONLY a JSON object where keys are the original column names and values are one of: ${fieldList}. Use "(ignore)" for columns that don't map to any recipe field.`

  const userMessage = `Columns: ${headers.join(', ')}\n\nSample rows:\n${sampleText}`

  try {
    const raw = await callLLM({
      model: LLM_MODEL_FAST,
      maxTokens: 512,
      system: systemPrompt,
      user: userMessage,
    })

    const mapping = parseLLMJsonSafe<Record<string, string>>(raw)
    if (mapping && typeof mapping === 'object') {
      // Validate all headers are present
      const result: Record<string, string> = {}
      for (const header of headers) {
        const field = mapping[header]
        result[header] = RECIPE_FIELDS.includes(field as RecipeField) ? field! : '(ignore)'
      }
      return result
    }
  } catch (err) {
    console.warn('[suggestNotionMapping] LLM call failed, falling back to fuzzy map:', err)
  }

  return fuzzyMap(headers)
}
