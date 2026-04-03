import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import { scopeQuery } from '@/lib/household'
import { createTagSchema, parseBody } from '@/lib/schemas'

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

export const GET = withAuth(async (req, { user, db, ctx }) => {
  // Fetch hidden_tags first — a new user has no preferences row, so use maybeSingle
  let prefsQ = db.from('user_preferences').select('hidden_tags')
  prefsQ = scopeQuery(prefsQ, user.id, ctx)
  const { data: prefs } = await prefsQ.maybeSingle()
  const hiddenSet = new Set((prefs?.hidden_tags ?? []).map((t: string) => t.toLowerCase()))

  // Fetch custom tags in scope
  let customQ = db.from('custom_tags').select('name, section').order('created_at', { ascending: true })
  customQ = scopeQuery(customQ, user.id, ctx)
  const { data: customData, error: customError } = await customQ

  if (customError) {
    return NextResponse.json({ error: customError.message }, { status: 500 })
  }

  // Fetch all recipe tags to build count map
  let recipesQ = db.from('recipes').select('tags')
  recipesQ = scopeQuery(recipesQ, user.id, ctx)
  const { data: recipes } = await recipesQ

  const counts = new Map<string, number>()
  for (const row of recipes ?? []) {
    for (const tag of (row.tags as string[] | null) ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  const firstClassLower = new Set(FIRST_CLASS_TAGS.map((t) => t.toLowerCase()))
  const custom = (customData ?? [])
    .filter((t) => !firstClassLower.has(t.name.toLowerCase()))
    .map((t) => ({ name: t.name, section: t.section, recipe_count: counts.get(t.name) ?? 0 }))

  const firstClass = FIRST_CLASS_TAGS
    .filter((t) => !hiddenSet.has(t.toLowerCase()))
    .map((name) => ({ name, recipe_count: counts.get(name) ?? 0 }))

  const hidden = FIRST_CLASS_TAGS
    .filter((t) => hiddenSet.has(t.toLowerCase()))
    .map((name) => ({ name }))

  return NextResponse.json({ firstClass, custom, hidden })
})

export const POST = withAuth(async (req, { user, db, ctx }) => {
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

  // Check for duplicate custom tag (case-insensitive) in scope
  const existingQuery = scopeQuery(db.from('custom_tags').select('id, name'), user.id, ctx)
  const { data: existing } = await existingQuery

  const duplicate = (existing ?? []).find((t) => t.name.toLowerCase() === lc)
  if (duplicate) {
    return NextResponse.json({ error: 'Tag already exists' }, { status: 409 })
  }

  const insertPayload = ctx
    ? { household_id: ctx.householdId, user_id: user.id, name: normalized, section }
    : { user_id: user.id, name: normalized, section }

  const { data: created, error: insertError } = await db
    .from('custom_tags')
    .insert(insertPayload)
    .select('id, name, section')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json(created, { status: 201 })
})
