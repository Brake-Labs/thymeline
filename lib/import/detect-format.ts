import 'server-only'

export type ImportFormat =
  | 'url_list'
  | 'csv'
  | 'paprika'
  | 'plan_to_eat'
  | 'whisk'
  | 'thymeline'
  | 'notion_csv'

/**
 * Auto-detect the import format from a File object.
 * Returns null if the format cannot be determined.
 */
export function detectFormat(file: File): ImportFormat | null {
  const name = file.name.toLowerCase()

  if (name.endsWith('.paprikarecipes')) return 'paprika'

  if (name.endsWith('.json')) return 'whisk'

  if (name.endsWith('.csv')) return null // resolved async — caller must read headers
  // For CSV, the caller must call detectCsvFormat() with the content string.

  return null
}

/**
 * Detect the CSV sub-format from parsed headers.
 * Called after reading the CSV content for .csv files.
 */
export function detectCsvFormat(
  headers: string[],
): 'plan_to_eat' | 'csv' | 'notion_csv' {
  const lower = headers.map((h) => h.trim().toLowerCase())

  // Plan to Eat: has Name + Source + Url + Directions
  if (
    lower.includes('name') &&
    lower.includes('source') &&
    lower.includes('url') &&
    lower.includes('directions')
  ) {
    return 'plan_to_eat'
  }

  // Generic CSV: has recognisable recipe columns
  const recipeColumns = ['title', 'ingredients', 'ingredient list', 'steps', 'instructions', 'directions', 'method']
  if (recipeColumns.some((col) => lower.includes(col))) {
    return 'csv'
  }

  return 'notion_csv'
}
