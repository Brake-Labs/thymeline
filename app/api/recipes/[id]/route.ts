import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { validateTags } from '@/lib/tags'
import { createAdminClient } from '@/lib/supabase-server'
import { updateRecipeSchema, parseBody } from '@/lib/schemas'

// Helper: attach last_made + times_made to a recipe row
async function withHistory(
  db: ReturnType<typeof createAdminClient>,
  recipe: Record<string, unknown>,
) {
  const { data: history } = await db
    .from('recipe_history')
    .select('made_on')
    .eq('recipe_id', recipe.id as string)

  const rows = history ?? []
  const last_made = rows.reduce<string | null>((max, r) => {
    if (!max) return r.made_on as string
    return (r.made_on as string) > max ? (r.made_on as string) : max
  }, null)
  const dates_made = rows.map((r) => r.made_on as string).sort().reverse()

  return { ...recipe, last_made, times_made: rows.length, dates_made }
}

export const GET = withAuth(async (req, { db }, params) => {
  const id = params.id!

  const { data: recipe, error } = await db
    .from('recipes')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !recipe) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(await withHistory(db, recipe))
})

export const PATCH = withAuth(async (req, { user, db, ctx }, params) => {
  const id = params.id!

  // Ownership check
  const { data: existing, error: fetchError } = await db
    .from('recipes')
    .select('user_id, household_id')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Household: any member can edit; Solo: must be owner
  if (ctx) {
    if (existing.household_id !== ctx.householdId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data: body, error: parseError } = await parseBody(req, updateRecipeSchema)
  if (parseError) return parseError

  if (body.tags !== undefined) {
    const tagResult = await validateTags(db, body.tags, user.id, ctx)
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
  if ('image_url' in body) update.image_url = body.image_url
  if ('prep_time_minutes' in body) update.prep_time_minutes = body.prep_time_minutes
  if ('cook_time_minutes' in body) update.cook_time_minutes = body.cook_time_minutes
  if ('total_time_minutes' in body) update.total_time_minutes = body.total_time_minutes
  if ('inactive_time_minutes' in body) update.inactive_time_minutes = body.inactive_time_minutes
  if ('servings' in body) update.servings = body.servings

  const { data: updated, error: updateError } = await db
    .from('recipes')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(updated)
})

export const DELETE = withAuth(async (req, { user, db, ctx }, params) => {
  const id = params.id!

  // Ownership check
  const { data: existing, error: fetchError } = await db
    .from('recipes')
    .select('user_id, household_id')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (ctx) {
    if (existing.household_id !== ctx.householdId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    if (existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { error: deleteError } = await db
    .from('recipes')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
})
