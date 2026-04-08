import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { scopeCondition } from '@/lib/household'
import { db } from '@/lib/db'
import { and, inArray } from 'drizzle-orm'
import { recipes } from '@/lib/db/schema'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GET = withAuth(async (req, { user, ctx }) => {
  const { searchParams } = new URL(req.url)
  const idsParam = searchParams.get('ids')

  let requestedIds: string[] | null = null
  if (idsParam) {
    requestedIds = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
    for (const id of requestedIds) {
      if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: `Invalid UUID: ${id}` }, { status: 400 })
      }
    }
  }

  const conditions = [
    scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, user.id, ctx),
  ]
  if (requestedIds) {
    conditions.push(inArray(recipes.id, requestedIds))
  }

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
      createdAt: recipes.createdAt,
    })
    .from(recipes)
    .where(and(...conditions))

  if (requestedIds && rows.length !== requestedIds.length) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const payload = {
    exported_at: new Date().toISOString(),
    recipe_count: rows.length,
    recipes: rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      ingredients: r.ingredients,
      steps: r.steps,
      notes: r.notes,
      servings: r.servings,
      prep_time_minutes: r.prepTimeMinutes,
      cook_time_minutes: r.cookTimeMinutes,
      total_time_minutes: r.totalTimeMinutes,
      tags: r.tags,
      source_url: r.url,
      created_at: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })),
  }

  const filename = `thymeline-recipes-${new Date().toISOString().slice(0, 10)}.json`

  return NextResponse.json(payload, {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})
