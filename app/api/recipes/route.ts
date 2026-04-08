import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { validateTags } from '@/lib/tags-server'
import { scopeCondition, scopeInsert } from '@/lib/household'
import { createRecipeSchema, parseBody } from '@/lib/schemas'
import { db } from '@/lib/db'
import { eq, and, desc, inArray, arrayContains } from 'drizzle-orm'
import { recipes, recipeHistory } from '@/lib/db/schema'
import { recipeListItemToJson, recipeRowToJson } from '@/lib/db/serialize'

export const GET = withAuth(async (req, { user, ctx }) => {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const tag = searchParams.get('tag')

  try {
    const conditions = [
      scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, user.id, ctx),
    ]
    if (category) conditions.push(eq(recipes.category, category))
    if (tag) conditions.push(arrayContains(recipes.tags, [tag]))

    const recipeRows = await db
      .select({
        id: recipes.id,
        userId: recipes.userId,
        householdId: recipes.householdId,
        title: recipes.title,
        category: recipes.category,
        tags: recipes.tags,
        isShared: recipes.isShared,
        createdAt: recipes.createdAt,
        totalTimeMinutes: recipes.totalTimeMinutes,
      })
      .from(recipes)
      .where(and(...conditions))
      .orderBy(desc(recipes.createdAt))

    // Attach lastMade and timesMade for each recipe
    const recipeIds = recipeRows.map((r) => r.id)
    const historyMap: Record<string, { lastMade: string | null; timesMade: number }> = {}

    if (recipeIds.length > 0) {
      const history = await db
        .select({ recipeId: recipeHistory.recipeId, madeOn: recipeHistory.madeOn })
        .from(recipeHistory)
        .where(inArray(recipeHistory.recipeId, recipeIds))

      for (const row of history) {
        const existing = historyMap[row.recipeId]
        if (!existing) {
          historyMap[row.recipeId] = { lastMade: row.madeOn, timesMade: 1 }
        } else {
          existing.timesMade += 1
          if (row.madeOn > (existing.lastMade ?? '')) {
            existing.lastMade = row.madeOn
          }
        }
      }
    }

    const result = recipeRows.map((r) => recipeListItemToJson({
      ...r,
      lastMade: historyMap[r.id]?.lastMade ?? null,
      timesMade: historyMap[r.id]?.timesMade ?? 0,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Failed to fetch recipes' }, { status: 500 })
  }
})

export const POST = withAuth(async (req, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, createRecipeSchema)
  if (parseError) return parseError

  const tags = body.tags

  const tagResult = await validateTags(null, tags, user.id, ctx)
  if (!tagResult.valid) {
    return NextResponse.json({ error: `Unknown tags: ${tagResult.unknownTags.join(', ')}` }, { status: 400 })
  }

  const insertPayload = {
    ...scopeInsert(user.id, ctx),
    title: body.title,
    category: body.category,
    tags,
    ingredients: body.ingredients,
    steps: body.steps,
    notes: body.notes,
    url: body.url,
    imageUrl: body.imageUrl,
    isShared: false,
    source: body.source,
    prepTimeMinutes: body.prepTimeMinutes,
    cookTimeMinutes: body.cookTimeMinutes,
    totalTimeMinutes: body.totalTimeMinutes,
    inactiveTimeMinutes: body.inactiveTimeMinutes,
    servings: body.servings,
  }

  try {
    const [data] = await db.insert(recipes).values(insertPayload).returning()
    if (!data) return NextResponse.json({ error: 'Failed to create recipe' }, { status: 500 })
    return NextResponse.json(recipeRowToJson(data), { status: 201 })
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Failed to create recipe' }, { status: 500 })
  }
})
