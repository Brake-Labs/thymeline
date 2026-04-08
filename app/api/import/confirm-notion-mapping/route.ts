import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { parseBody, confirmNotionMappingSchema } from '@/lib/schemas'
import { parseCsv } from '@/lib/import/parse-csv'
import { detectDuplicates } from '@/lib/import/detect-duplicates'
import type { ParsedRecipe } from '@/types'

type ImportFileResult = {
  status:     'ready' | 'partial' | 'failed'
  recipe?:    ParsedRecipe
  error?:     string
  duplicate?: { recipeId: string; recipeTitle: string }
}

function recipeToStatus(r: ParsedRecipe): 'ready' | 'partial' {
  if (!r.ingredients || !r.steps) return 'partial'
  return 'ready'
}

export const POST = withAuth(async (req: NextRequest, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, confirmNotionMappingSchema)
  if (parseError) return parseError

  let parsedRecipes: ParsedRecipe[]
  try {
    parsedRecipes = parseCsv(body.fileContent, body.mapping)
  } catch (err) {
    console.error('[POST /api/import/confirm-notion-mapping] Parse failed:', err)
    return NextResponse.json({ error: 'Parse failed' }, { status: 500 })
  }

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
    format:  'notion_csv',
    total:   results.length,
    results,
  })
})
