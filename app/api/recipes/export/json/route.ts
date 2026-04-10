import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { scopeCondition } from '@/lib/household'
import { db } from '@/lib/db'
import { and, asc, inArray } from 'drizzle-orm'
import { recipes, recipeHistory } from '@/lib/db/schema'

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
      inactiveTimeMinutes: recipes.inactiveTimeMinutes,
      tags: recipes.tags,
      url: recipes.url,
      imageUrl: recipes.imageUrl,
      source: recipes.source,
      stepPhotos: recipes.stepPhotos,
      createdAt: recipes.createdAt,
    })
    .from(recipes)
    .where(and(...conditions))

  if (requestedIds && rows.length !== requestedIds.length) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch cook history for all exported recipes in a single batch query.
  // Recipe IDs are already scoped by ownership, so filtering history by recipeId is sufficient.
  const exportedIds = rows.map((r) => r.id)
  const historyRows = exportedIds.length > 0
    ? await db
        .select({
          recipeId: recipeHistory.recipeId,
          madeOn: recipeHistory.madeOn,
        })
        .from(recipeHistory)
        .where(inArray(recipeHistory.recipeId, exportedIds))
        .orderBy(asc(recipeHistory.madeOn))
    : []

  // Group history by recipe ID
  const historyByRecipeId = new Map<string, { made_on: string }[]>()
  for (const h of historyRows) {
    const entries = historyByRecipeId.get(h.recipeId) ?? []
    entries.push({ made_on: h.madeOn })
    historyByRecipeId.set(h.recipeId, entries)
  }

  const payload = {
    format: 'thymeline',
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
      inactive_time_minutes: r.inactiveTimeMinutes,
      tags: r.tags,
      url: r.url,
      image_url: r.imageUrl,
      source: r.source,
      step_photos: r.stepPhotos,
      created_at: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      history: historyByRecipeId.get(r.id) ?? [],
    })),
  }

  const filename = `thymeline-recipes-${new Date().toISOString().slice(0, 10)}.json`

  return NextResponse.json(payload, {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})
