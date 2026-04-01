import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { scopeQuery } from '@/lib/household'

export const GET = withAuth(async (req, { user, db, ctx }, params) => {
  const tagName = decodeURIComponent((params?.tag_name as string) ?? '')
  if (!tagName) {
    return NextResponse.json({ error: 'tag_name is required' }, { status: 400 })
  }

  // Count recipes in scope that carry this tag
  let countQ = db.from('recipes').select('id', { count: 'exact', head: true }).contains('tags', [tagName])
  countQ = scopeQuery(countQ, user.id, ctx)
  const { count } = await countQ

  return NextResponse.json({ name: tagName, recipe_count: count ?? 0 })
})

export const DELETE = withAuth(async (req, { user, db, ctx }, params) => {
  const tagName = decodeURIComponent((params?.tag_name as string) ?? '')
  if (!tagName) {
    return NextResponse.json({ error: 'tag_name is required' }, { status: 400 })
  }

  // Household members cannot delete tags — owner/co_owner only
  if (ctx && ctx.role === 'member') {
    return NextResponse.json({ error: 'Only household owners can delete tags' }, { status: 403 })
  }

  // Verify the tag exists in this scope and get its ID
  let tagQ = db.from('custom_tags').select('id').eq('name', tagName)
  tagQ = scopeQuery(tagQ, user.id, ctx)
  const { data: tagRow } = await tagQ.single()

  if (!tagRow) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  // Find all recipes in scope that carry this tag
  let recipesQ = db.from('recipes').select('id, tags').contains('tags', [tagName])
  recipesQ = scopeQuery(recipesQ, user.id, ctx)
  const { data: affectedRecipes } = await recipesQ

  // Remove the tag from each affected recipe
  const tagNameLower = tagName.toLowerCase()
  for (const recipe of affectedRecipes ?? []) {
    const newTags = (recipe.tags as string[]).filter(
      (t) => t.toLowerCase() !== tagNameLower,
    )
    await db.from('recipes').update({ tags: newTags }).eq('id', recipe.id)
  }

  // Delete the custom tag by ID (ownership already verified above)
  await db.from('custom_tags').delete().eq('id', tagRow.id)

  return new NextResponse(null, { status: 204 })
})
