import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { scopeCondition, scopeInsert } from '@/lib/household'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import { z } from 'zod'
import { parseBody } from '@/lib/schemas'
import { db } from '@/lib/db'
import { eq, and, arrayContains, sql } from 'drizzle-orm'
import { recipes, customTags, userPreferences } from '@/lib/db/schema'
import { dbFirst } from '@/lib/db/helpers'

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

const renameTagSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
})

export const GET = withAuth(async (req, { user, ctx }, params) => {
  const tagName = decodeURIComponent((params?.tag_name as string) ?? '')
  if (!tagName) {
    return NextResponse.json({ error: 'tag_name is required' }, { status: 400 })
  }

  try {
    // Count recipes in scope that carry this tag
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(recipes)
      .where(
        and(
          scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, user.id, ctx),
          arrayContains(recipes.tags, [tagName]),
        ),
      )

    const count = Number(rows[0]?.count ?? 0)
    return NextResponse.json({ name: tagName, recipe_count: count })
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
  }
})

export const PATCH = withAuth(async (req, { user, ctx }, params) => {
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

  try {
    // Verify tag exists in this scope
    const tagRows = await db
      .select({ id: customTags.id, section: customTags.section })
      .from(customTags)
      .where(
        and(
          eq(customTags.name, tagName),
          scopeCondition({ userId: customTags.userId, householdId: customTags.householdId }, user.id, ctx),
        ),
      )

    const tagRow = dbFirst(tagRows)

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
    const dupeRows = await db
      .select({ id: customTags.id })
      .from(customTags)
      .where(
        and(
          eq(customTags.name, newName),
          scopeCondition({ userId: customTags.userId, householdId: customTags.householdId }, user.id, ctx),
        ),
      )

    if (dupeRows.length > 0) {
      return NextResponse.json({ error: `A tag named '${newName}' already exists.` }, { status: 409 })
    }

    // Update the tag name
    await db.update(customTags).set({ name: newName }).where(eq(customTags.id, tagRow.id))

    // Update all affected recipes
    const affected = await db
      .select({ id: recipes.id, tags: recipes.tags })
      .from(recipes)
      .where(
        and(
          scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, user.id, ctx),
          arrayContains(recipes.tags, [tagName]),
        ),
      )

    for (const recipe of affected) {
      const newTags = recipe.tags.map((t) =>
        t.toLowerCase() === tagName.toLowerCase() ? newName : t
      )
      await db.update(recipes).set({ tags: newTags }).where(eq(recipes.id, recipe.id))
    }

    return NextResponse.json({ name: newName, section: tagRow.section })
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
  }
})

export const DELETE = withAuth(async (req, { user, ctx }, params) => {
  const tagName = decodeURIComponent((params?.tag_name as string) ?? '')
  if (!tagName) {
    return NextResponse.json({ error: 'tag_name is required' }, { status: 400 })
  }

  // Household members cannot delete or hide tags
  if (ctx && ctx.role === 'member') {
    return NextResponse.json({ error: 'Only household owners can delete tags' }, { status: 403 })
  }

  try {
    // First-class tags: hide them (add to hidden_tags) rather than deleting
    const isFirstClass = FIRST_CLASS_TAGS.some(
      (t) => t.toLowerCase() === tagName.toLowerCase()
    )
    if (isFirstClass) {
      const prefsRows = await db
        .select({ hiddenTags: userPreferences.hiddenTags })
        .from(userPreferences)
        .where(scopeCondition({ userId: userPreferences.userId, householdId: userPreferences.householdId }, user.id, ctx))

      const prefs = dbFirst(prefsRows)
      const current: string[] = prefs?.hiddenTags ?? []

      if (!current.map((t) => t.toLowerCase()).includes(tagName.toLowerCase())) {
        const upsertPayload = {
          ...scopeInsert(user.id, ctx),
          hiddenTags: [...current, tagName],
        }
        // Upsert: insert or update on conflict
        await db
          .insert(userPreferences)
          .values(upsertPayload)
          .onConflictDoUpdate({
            target: ctx ? userPreferences.householdId : userPreferences.userId,
            set: { hiddenTags: [...current, tagName] },
          })
      }
      return new NextResponse(null, { status: 204 })
    }

    // Verify the custom tag exists in this scope
    const tagRows = await db
      .select({ id: customTags.id })
      .from(customTags)
      .where(
        and(
          eq(customTags.name, tagName),
          scopeCondition({ userId: customTags.userId, householdId: customTags.householdId }, user.id, ctx),
        ),
      )

    const tagRow = dbFirst(tagRows)

    if (!tagRow) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    // Find all recipes in scope that carry this tag
    const affectedRecipes = await db
      .select({ id: recipes.id, tags: recipes.tags })
      .from(recipes)
      .where(
        and(
          scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, user.id, ctx),
          arrayContains(recipes.tags, [tagName]),
        ),
      )

    // Remove the tag from each affected recipe
    const tagNameLower = tagName.toLowerCase()
    for (const recipe of affectedRecipes) {
      const newTags = recipe.tags.filter(
        (t) => t.toLowerCase() !== tagNameLower,
      )
      await db.update(recipes).set({ tags: newTags }).where(eq(recipes.id, recipe.id))
    }

    // Delete the custom tag by ID (ownership already verified above)
    await db.delete(customTags).where(eq(customTags.id, tagRow.id))

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
  }
})
