import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { detectFormat, detectCsvFormat } from '@/lib/import/detect-format'
import { parseCsv } from '@/lib/import/parse-csv'
import { parsePlanToEat } from '@/lib/import/parse-plan-to-eat'
import { parseWhisk } from '@/lib/import/parse-whisk'
import { parsePaprika } from '@/lib/import/parse-paprika'
import { detectDuplicates } from '@/lib/import/detect-duplicates'
import { suggestNotionMapping } from '@/lib/import/notion-mapping'
import type { ParsedRecipe } from '@/types'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

type ImportFileFormat = 'csv' | 'paprika' | 'plan_to_eat' | 'whisk' | 'notion_csv'

type ImportFileResult = {
  status:     'ready' | 'partial' | 'failed'
  recipe?:    ParsedRecipe
  error?:     string
  duplicate?: { recipeId: string; recipeTitle: string }
}

function recipeToStatus(r: ParsedRecipe): 'ready' | 'partial' {
  if (!r.ingredients && !r.steps) return 'partial'
  if (!r.ingredients || !r.steps) return 'partial'
  return 'ready'
}

export const POST = withAuth(async (req: NextRequest, { user, db, ctx }) => {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = form.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 413 })
  }

  const formatHint = form.get('format') as string | null

  // Detect format
  let format: ImportFileFormat | null = null

  if (formatHint) {
    const validFormats: ImportFileFormat[] = ['csv', 'paprika', 'plan_to_eat', 'whisk', 'notion_csv']
    format = validFormats.includes(formatHint as ImportFileFormat)
      ? (formatHint as ImportFileFormat)
      : null
  } else {
    const detected = detectFormat(file)
    if (detected === 'paprika') format = 'paprika'
    else if (detected === 'whisk') format = 'whisk'
    // For CSV: need to read content to determine sub-format
  }

  const buffer = await file.arrayBuffer()

  // For CSV files, detect sub-format from headers
  if (!format && file.name.toLowerCase().endsWith('.csv')) {
    const text = new TextDecoder().decode(buffer)
    const firstLine = text.split('\n')[0] ?? ''
    const headers = firstLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
    format = detectCsvFormat(headers)
  }

  if (!format) {
    return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 })
  }

  // Parse
  let parsedRecipes: ParsedRecipe[]

  try {
    if (format === 'paprika') {
      parsedRecipes = await parsePaprika(buffer)
    } else if (format === 'whisk') {
      const text = new TextDecoder().decode(buffer)
      parsedRecipes = parseWhisk(text)
    } else {
      const text = new TextDecoder().decode(buffer)

      // Notion CSV: return mapping for user confirmation — do NOT parse data yet
      if (format === 'notion_csv') {
        const firstLine = text.split('\n')[0] ?? ''
        const headers = firstLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
        const sampleLines = text.split('\n').slice(1, 3)
        const sampleRows = sampleLines.map((line) =>
          line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')),
        )
        const notionMapping = await suggestNotionMapping(headers, sampleRows)

        return NextResponse.json({
          format,
          total:          0,
          results:        [],
          notion_mapping: notionMapping,
        })
      }

      parsedRecipes = format === 'plan_to_eat'
        ? parsePlanToEat(text)
        : parseCsv(text)
    }
  } catch (err) {
    console.error('[POST /api/import/file] Parse failed:', err)
    return NextResponse.json({ error: 'Parse failed' }, { status: 500 })
  }

  // Duplicate detection
  const duplicates = await detectDuplicates(parsedRecipes, db, user.id, ctx)

  const results: ImportFileResult[] = parsedRecipes.map((recipe, i) => {
    if (!recipe.title) {
      return { status: 'failed' as const, error: 'Missing title' }
    }
    return {
      status: recipeToStatus(recipe),
      recipe,
      duplicate: duplicates[i] ?? undefined,
    }
  })

  return NextResponse.json({
    format,
    total:   results.length,
    results,
  })
})
