import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import { createTagSchema, parseBody } from '@/lib/schemas'

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

export const GET = withAuth(async (req, { user, db, ctx }) => {
  let query = db.from('custom_tags').select('name, section').order('created_at', { ascending: true })
  if (ctx) {
    query = query.eq('household_id', ctx.householdId)
  } else {
    query = query.eq('user_id', user.id)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const firstClassLower = new Set(FIRST_CLASS_TAGS.map((t) => t.toLowerCase()))
  const custom = (data ?? [])
    .filter((t: { name: string }) => !firstClassLower.has(t.name.toLowerCase()))
    .map((t: { name: string; section: string }) => ({ name: t.name, section: t.section }))

  return NextResponse.json({ firstClass: FIRST_CLASS_TAGS, custom })
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
  let existingQuery = db.from('custom_tags').select('id, name')
  if (ctx) {
    existingQuery = existingQuery.eq('household_id', ctx.householdId)
  } else {
    existingQuery = existingQuery.eq('user_id', user.id)
  }
  const { data: existing } = await existingQuery

  const duplicate = (existing ?? []).find((t: { name: string }) => t.name.toLowerCase() === lc)
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
