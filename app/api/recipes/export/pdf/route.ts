import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { scopeCondition } from '@/lib/household'
import { exportPdfSchema, parseBody } from '@/lib/schemas'
import { db } from '@/lib/db'
import { and, inArray } from 'drizzle-orm'
import { recipes } from '@/lib/db/schema'
import { generateRecipePdf } from '@/lib/pdf-generator'
import { slugify } from '@/lib/recipe-export'

export const POST = withAuth(async (req, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, exportPdfSchema)
  if (parseError) return parseError

  const { recipe_ids, format } = body

  const rows = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      category: recipes.category,
      ingredients: recipes.ingredients,
      steps: recipes.steps,
      notes: recipes.notes,
      servings: recipes.servings,
      prepTimeMinutes: recipes.prepTimeMinutes,
      cookTimeMinutes: recipes.cookTimeMinutes,
      totalTimeMinutes: recipes.totalTimeMinutes,
      tags: recipes.tags,
      url: recipes.url,
    })
    .from(recipes)
    .where(
      and(
        scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, user.id, ctx),
        inArray(recipes.id, recipe_ids),
      ),
    )

  if (rows.length !== recipe_ids.length) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const pdfBytes = await generateRecipePdf(rows, format)

    const filename =
      format === 'single'
        ? `${slugify(rows[0]!.title)}.pdf`
        : `thymeline-recipes-${new Date().toISOString().slice(0, 10)}.pdf`

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }
})
