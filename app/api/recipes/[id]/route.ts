import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { validateTags } from '@/lib/tags-server'
import { updateRecipeSchema, parseBody } from '@/lib/schemas'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { recipes, recipeHistory } from '@/lib/db/schema'
import { dbFirst } from '@/lib/db/helpers'
import { checkOwnership } from '@/lib/household'

// Helper: attach last_made + times_made to a recipe row
async function withHistory(recipe: Record<string, unknown>) {
  const history = await db
    .select({ madeOn: recipeHistory.madeOn })
    .from(recipeHistory)
    .where(eq(recipeHistory.recipeId, recipe.id as string))

  const last_made = history.reduce<string | null>((max, r) => {
    if (!max) return r.madeOn
    return r.madeOn > max ? r.madeOn : max
  }, null)
  const dates_made = history.map((r) => r.madeOn).sort().reverse()

  return { ...recipe, last_made, times_made: history.length, dates_made }
}

export const GET = withAuth(async (req, { user, ctx }, params) => {
  const id = params.id!

  try {
    const rows = await db.select().from(recipes).where(eq(recipes.id, id))
    const recipe = dbFirst(rows)

    if (!recipe) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Allow access if: owner/household member, or recipe is shared
    if (!recipe.isShared) {
      const ownership = await checkOwnership('recipes', id, user.id, ctx)
      if (!ownership.owned) {
        const msg = ownership.status === 404 ? 'Not found' : 'Forbidden'
        return NextResponse.json({ error: msg }, { status: ownership.status })
      }
    }

    return NextResponse.json(await withHistory(recipe as Record<string, unknown>))
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
  }
})

export const PATCH = withAuth(async (req, { user, ctx }, params) => {
  const id = params.id!

  try {
    // Ownership check
    const existingRows = await db
      .select({ userId: recipes.userId, householdId: recipes.householdId })
      .from(recipes)
      .where(eq(recipes.id, id))

    const existing = dbFirst(existingRows)

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Household: any member can edit; Solo: must be owner
    if (ctx) {
      if (existing.householdId !== ctx.householdId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else {
      if (existing.userId !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const { data: body, error: parseError } = await parseBody(req, updateRecipeSchema)
    if (parseError) return parseError

    if (body.tags !== undefined) {
      const tagResult = await validateTags(null, body.tags, user.id, ctx)
      if (!tagResult.valid) {
        return NextResponse.json({ error: `Unknown tags: ${tagResult.unknownTags.join(', ')}` }, { status: 400 })
      }
    }

    // Build update payload — only fields present in the request
    const update: Record<string, unknown> = {}
    if (body.title !== undefined) update.title = body.title
    if (body.category !== undefined) update.category = body.category
    if (body.tags !== undefined) update.tags = body.tags
    if ('ingredients' in body) update.ingredients = body.ingredients
    if ('steps' in body) update.steps = body.steps
    if ('notes' in body) update.notes = body.notes
    if ('url' in body) update.url = body.url
    if ('image_url' in body) update.imageUrl = body.image_url
    if ('prep_time_minutes' in body) update.prepTimeMinutes = body.prep_time_minutes
    if ('cook_time_minutes' in body) update.cookTimeMinutes = body.cook_time_minutes
    if ('total_time_minutes' in body) update.totalTimeMinutes = body.total_time_minutes
    if ('inactive_time_minutes' in body) update.inactiveTimeMinutes = body.inactive_time_minutes
    if ('servings' in body) update.servings = body.servings

    const [updated] = await db
      .update(recipes)
      .set(update)
      .where(eq(recipes.id, id))
      .returning()

    return NextResponse.json(updated)
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Failed to update recipe' }, { status: 500 })
  }
})

export const DELETE = withAuth(async (req, { user, ctx }, params) => {
  const id = params.id!

  try {
    // Ownership check
    const existingRows = await db
      .select({ userId: recipes.userId, householdId: recipes.householdId })
      .from(recipes)
      .where(eq(recipes.id, id))

    const existing = dbFirst(existingRows)

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (ctx) {
      if (existing.householdId !== ctx.householdId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else {
      if (existing.userId !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    await db.delete(recipes).where(eq(recipes.id, id))

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Failed to delete recipe' }, { status: 500 })
  }
})
