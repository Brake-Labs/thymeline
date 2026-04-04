import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { scopeQuery, scopeInsert } from '@/lib/household'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import { z } from 'zod'
import { parseBody } from '@/lib/schemas'

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

const renameTagSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
})

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

export const PATCH = withAuth(async (req, { user, db, ctx }, params) => {
  const tagName = decodeURIComponent((params?.tag_name as string) ?? '')
  if (!tagName) {
    return NextResponse.json({ error: 'tag_name is required' }, { status: 400 })
  }

  // Household members cannot rename tags
  if (ctx && ctx.role === 'member') {
    return NextResponse.json({ error: 'Only household owners can rename tags' }, { status: 403 })
  }

  const { data: body, error: parseError } = await parseBody(req, renameTagSchema)
  if (parseError) return parseError

  const newName = toTitleCase(body.name)
  const newNameLc = newName.toLowerCase()

  // Verify tag exists in this scope
  let tagQ = db.from('custom_tags').select('id, section').eq('name', tagName)
  tagQ = scopeQuery(tagQ, user.id, ctx)
  const { data: tagRow } = await tagQ.single()

  if (!tagRow) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  // Reject if new name matches a first-class tag
  if (FIRST_CLASS_TAGS.some((t) => t.toLowerCase() === newNameLc)) {
    return NextResponse.json(
      { error: `'${newName}' is a built-in tag name and cannot be used for a custom tag.` },
      { status: 400 },
    )
  }

  // Reject if new name already taken by another custom tag in scope (case-insensitive)
  let dupeQ = db.from('custom_tags').select('id').eq('name', newName)
  dupeQ = scopeQuery(dupeQ, user.id, ctx)
  const { data: dupeRow } = await dupeQ.maybeSingle()
  if (dupeRow) {
    return NextResponse.json({ error: `A tag named '${newName}' already exists.` }, { status: 409 })
  }

  // Update the tag name
  await db.from('custom_tags').update({ name: newName }).eq('id', tagRow.id)

  // Update all affected recipes
  let recipesQ = db.from('recipes').select('id, tags').contains('tags', [tagName])
  recipesQ = scopeQuery(recipesQ, user.id, ctx)
  const { data: affected } = await recipesQ

  for (const recipe of affected ?? []) {
    const newTags = (recipe.tags as string[]).map((t) =>
      t.toLowerCase() === tagName.toLowerCase() ? newName : t
    )
    await db.from('recipes').update({ tags: newTags }).eq('id', recipe.id)
  }

  return NextResponse.json({ name: newName, section: tagRow.section })
})

export const DELETE = withAuth(async (req, { user, db, ctx }, params) => {
  const tagName = decodeURIComponent((params?.tag_name as string) ?? '')
  if (!tagName) {
    return NextResponse.json({ error: 'tag_name is required' }, { status: 400 })
  }

  // Household members cannot delete or hide tags
  if (ctx && ctx.role === 'member') {
    return NextResponse.json({ error: 'Only household owners can delete tags' }, { status: 403 })
  }

  // First-class tags: hide them (add to hidden_tags) rather than deleting
  const isFirstClass = FIRST_CLASS_TAGS.some(
    (t) => t.toLowerCase() === tagName.toLowerCase()
  )
  if (isFirstClass) {
    let prefsQ = db.from('user_preferences').select('hidden_tags')
    prefsQ = scopeQuery(prefsQ, user.id, ctx)
    const { data: prefs } = await prefsQ.maybeSingle()
    const current: string[] = prefs?.hidden_tags ?? []

    if (!current.map((t) => t.toLowerCase()).includes(tagName.toLowerCase())) {
      const payload = scopeInsert(user.id, ctx, { hidden_tags: [...current, tagName] })
      const onConflict = ctx ? 'household_id' : 'user_id'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic payload shape
      await db.from('user_preferences').upsert(payload as any, { onConflict })
    }
    return new NextResponse(null, { status: 204 })
  }

  // Verify the custom tag exists in this scope
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
