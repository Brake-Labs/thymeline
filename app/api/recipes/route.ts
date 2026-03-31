import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { validateTags } from '@/lib/tags'
import { createRecipeSchema, parseBody } from '@/lib/schemas'

export const GET = withAuth(async (req, { user, db, ctx }) => {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const tag = searchParams.get('tag')

  let query = db
    .from('recipes')
    .select('id, user_id, household_id, title, category, tags, is_shared, created_at, total_time_minutes')
    .order('created_at', { ascending: false })

  if (ctx) {
    query = query.eq('household_id', ctx.householdId)
  } else {
    query = query.eq('user_id', user.id)
  }

  if (category) query = query.eq('category', category)
  if (tag) query = query.contains('tags', [tag])

  const { data: recipes, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Attach last_made and times_made for each recipe
  const recipeIds = (recipes ?? []).map((r) => r.id)
  const historyMap: Record<string, { last_made: string | null; times_made: number }> = {}

  if (recipeIds.length > 0) {
    const { data: history } = await db
      .from('recipe_history')
      .select('recipe_id, made_on')
      .in('recipe_id', recipeIds)

    for (const row of history ?? []) {
      const existing = historyMap[row.recipe_id]
      if (!existing) {
        historyMap[row.recipe_id] = { last_made: row.made_on, times_made: 1 }
      } else {
        existing.times_made += 1
        if (row.made_on > (existing.last_made ?? '')) {
          existing.last_made = row.made_on
        }
      }
    }
  }

  const result = (recipes ?? []).map((r) => ({
    ...r,
    last_made: historyMap[r.id]?.last_made ?? null,
    times_made: historyMap[r.id]?.times_made ?? 0,
  }))

  return NextResponse.json(result)
})

export const POST = withAuth(async (req, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, createRecipeSchema)
  if (parseError) return parseError

  const tags = body.tags

  const tagResult = await validateTags(db, tags, user.id, ctx)
  if (!tagResult.valid) {
    return NextResponse.json({ error: `Unknown tags: ${tagResult.unknownTags.join(', ')}` }, { status: 400 })
  }

  const insertPayload = ctx
    ? {
        household_id: ctx.householdId,
        user_id: user.id,
        title: body.title,
        category: body.category,
        tags,
        ingredients: body.ingredients,
        steps: body.steps,
        notes: body.notes,
        url: body.url,
        image_url: body.image_url,
        is_shared: false,
        source: body.source,
        prep_time_minutes: body.prep_time_minutes,
        cook_time_minutes: body.cook_time_minutes,
        total_time_minutes: body.total_time_minutes,
        inactive_time_minutes: body.inactive_time_minutes,
        servings: body.servings,
      }
    : {
        user_id: user.id,
        title: body.title,
        category: body.category,
        tags,
        ingredients: body.ingredients,
        steps: body.steps,
        notes: body.notes,
        url: body.url,
        image_url: body.image_url,
        is_shared: false,
        source: body.source,
        prep_time_minutes: body.prep_time_minutes,
        cook_time_minutes: body.cook_time_minutes,
        total_time_minutes: body.total_time_minutes,
        inactive_time_minutes: body.inactive_time_minutes,
        servings: body.servings,
      }

  const { data, error } = await db
    .from('recipes')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
})
