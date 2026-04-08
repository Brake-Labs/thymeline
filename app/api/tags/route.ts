import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import { scopeCondition, scopeInsert } from '@/lib/household'
import { createTagSchema, parseBody } from '@/lib/schemas'
import { db } from '@/lib/db'
import { asc } from 'drizzle-orm'
import { recipes, customTags, userPreferences } from '@/lib/db/schema'
import { dbFirst } from '@/lib/db/helpers'

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

export const GET = withAuth(async (req, { user, ctx }) => {
  try {
    // Fetch hiddenTags first — a new user has no preferences row, so use dbFirst
    const prefsRows = await db
      .select({ hiddenTags: userPreferences.hiddenTags })
      .from(userPreferences)
      .where(scopeCondition({ userId: userPreferences.userId, householdId: userPreferences.householdId }, user.id, ctx))

    const prefs = dbFirst(prefsRows)
    const hiddenSet = new Set((prefs?.hiddenTags ?? []).map((t: string) => t.toLowerCase()))

    // Fetch custom tags in scope
    const customData = await db
      .select({ name: customTags.name, section: customTags.section })
      .from(customTags)
      .where(scopeCondition({ userId: customTags.userId, householdId: customTags.householdId }, user.id, ctx))
      .orderBy(asc(customTags.createdAt))

    // Fetch all recipe tags to build count map
    const recipeRows = await db
      .select({ tags: recipes.tags })
      .from(recipes)
      .where(scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, user.id, ctx))

    const counts = new Map<string, number>()
    for (const row of recipeRows) {
      for (const tag of row.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }

    const firstClassLower = new Set(FIRST_CLASS_TAGS.map((t) => t.toLowerCase()))
    const custom = customData
      .filter((t) => !firstClassLower.has(t.name.toLowerCase()))
      .map((t) => ({ name: t.name, section: t.section, recipeCount: counts.get(t.name) ?? 0 }))

    const firstClass = FIRST_CLASS_TAGS
      .filter((t) => !hiddenSet.has(t.toLowerCase()))
      .map((name) => ({ name, recipeCount: counts.get(name) ?? 0 }))

    const hidden = FIRST_CLASS_TAGS
      .filter((t) => hiddenSet.has(t.toLowerCase()))
      .map((name) => ({ name }))

    return NextResponse.json({ firstClass, custom, hidden })
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 })
  }
})

export const POST = withAuth(async (req, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, createTagSchema)
  if (parseError) return parseError

  const normalized = toTitleCase(body.name)
  const section = body.section
  const lc = normalized.toLowerCase()

  // Reject if it matches a first-class tag (case-insensitive)
  const firstClassMatch = FIRST_CLASS_TAGS.find((t) => t.toLowerCase() === lc)
  if (firstClassMatch) {
    return NextResponse.json(
      { error: `'${firstClassMatch}' is a built-in tag and cannot be added as a custom tag.` },
      { status: 400 },
    )
  }

  try {
    // Check for duplicate custom tag (case-insensitive) in scope
    const existing = await db
      .select({ id: customTags.id, name: customTags.name })
      .from(customTags)
      .where(scopeCondition({ userId: customTags.userId, householdId: customTags.householdId }, user.id, ctx))

    const duplicate = existing.find((t) => t.name.toLowerCase() === lc)
    if (duplicate) {
      return NextResponse.json({ error: 'Tag already exists' }, { status: 409 })
    }

    const insertPayload = {
      ...scopeInsert(user.id, ctx),
      name: normalized,
      section,
    }

    const [created] = await db
      .insert(customTags)
      .values(insertPayload)
      .returning({ id: customTags.id, name: customTags.name, section: customTags.section })

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 })
  }
})
