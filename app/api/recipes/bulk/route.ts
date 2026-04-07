import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { bulkUpdateRecipesSchema, parseBody } from '@/lib/schemas'
import { validateTags } from '@/lib/tags'

export const PATCH = withAuth(async (req: NextRequest, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, bulkUpdateRecipesSchema)
  if (parseError) return parseError

  const recipeIds = body.recipe_ids
  const addTags = body.add_tags

  // Fetch all requested recipes
  const { data: recipes, error: fetchError } = await db
    .from('recipes')
    .select('id, user_id, household_id, tags')
    .in('id', recipeIds)

  if (fetchError) {
    console.error('Bulk fetch failed:', fetchError.message, fetchError.code)
    return NextResponse.json({ error: 'Failed to fetch recipes' }, { status: 500 })
  }

  const found = recipes ?? []

  // Verify all IDs belong to this user or household
  const forbidden = found.some((r) => {
    if (ctx) return r.household_id !== ctx.householdId
    return r.user_id !== user.id
  })
  if (forbidden || found.length !== recipeIds.length) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tagResult = await validateTags(db, addTags, user.id, ctx)
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
    db.from('recipes').update({ tags }).eq('id', id).select().single()
  )

  const results = await Promise.all(updatePromises)
  const errors = results.filter((r) => r.error)
  if (errors.length > 0) {
    console.error('Bulk update failed:', errors[0]?.error?.message)
    return NextResponse.json({ error: 'Failed to update recipes' }, { status: 500 })
  }

  const updatedRecipes = results.map((r) => r.data)
  return NextResponse.json(updatedRecipes)
})
