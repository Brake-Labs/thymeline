import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { bulkUpdateRecipesSchema, parseBody } from '@/lib/schemas'
import { validateTags } from '@/lib/tags-server'
import { db } from '@/lib/db'
import { eq, inArray } from 'drizzle-orm'
import { recipes } from '@/lib/db/schema'

export const PATCH = withAuth(async (req: NextRequest, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, bulkUpdateRecipesSchema)
  if (parseError) return parseError

  const recipeIds = body.recipeIds
  const addTags = body.addTags

  try {
    // Fetch all requested recipes
    const found = await db
      .select({
        id: recipes.id,
        userId: recipes.userId,
        householdId: recipes.householdId,
        tags: recipes.tags,
      })
      .from(recipes)
      .where(inArray(recipes.id, recipeIds))

    // Verify all IDs belong to this user or household
    const forbidden = found.some((r) => {
      if (ctx) return r.householdId !== ctx.householdId
      return r.userId !== user.id
    })
    if (forbidden || found.length !== recipeIds.length) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const tagResult = await validateTags(null, addTags, user.id, ctx)
    if (!tagResult.valid) {
      return NextResponse.json({ error: `Unknown tags: ${tagResult.unknownTags.join(', ')}` }, { status: 400 })
    }

    // Merge tags for each recipe and update
    const updates = found.map((r) => {
      const existing = r.tags
      const merged = [...existing]
      for (const tag of addTags) {
        if (!merged.includes(tag)) merged.push(tag)
      }
      return { id: r.id, tags: merged }
    })

    const updatePromises = updates.map(({ id, tags }) =>
      db.update(recipes).set({ tags }).where(eq(recipes.id, id)).returning(),
    )

    const results = await Promise.all(updatePromises)
    const updatedRecipes = results.map((rows) => rows[0])

    return NextResponse.json(updatedRecipes)
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Failed to update recipes' }, { status: 500 })
  }
})
