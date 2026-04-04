import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { createPantryItemSchema, deletePantryItemsSchema, parseBody } from '@/lib/schemas'
import { scopeQuery } from '@/lib/household'
import { parseIngredientLine, assignSection } from '@/lib/grocery'

// ── GET /api/pantry ───────────────────────────────────────────────────────────

export const GET = withAuth(async (req, { user, db, ctx }) => {
  const query = scopeQuery(db
    .from('pantry_items')
    .select('*')
    .order('section', { nullsFirst: false })
    .order('name'), user.id, ctx)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data })
})

// ── POST /api/pantry ──────────────────────────────────────────────────────────

export const POST = withAuth(async (req, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, createPantryItemSchema)
  if (parseError) return parseError

  // Free-text parsing: extract leading amount + unit token from the name field
  const parsed = parseIngredientLine(body.name)

  let name: string
  let quantity: string | null

  if (parsed.rawName && parsed.rawName.trim()) {
    name = parsed.rawName.trim()
    const parsedQty = [
      parsed.amount !== null ? String(parsed.amount) : null,
      parsed.unit ?? null,
    ].filter(Boolean).join(' ')
    quantity = body.quantity !== undefined ? body.quantity : (parsedQty || null)
  } else {
    name = body.name
    quantity = body.quantity !== undefined ? body.quantity : null
  }

  const section = body.section !== undefined ? body.section : assignSection(name)

  const insertPayload = ctx
    ? { household_id: ctx.householdId, user_id: user.id, name, quantity, section, expiry_date: body.expiry_date ?? null }
    : { user_id: user.id, name, quantity, section, expiry_date: body.expiry_date ?? null }

  const { data, error } = await db
    .from('pantry_items')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data }, { status: 201 })
})

// ── DELETE /api/pantry (bulk) ─────────────────────────────────────────────────

export const DELETE = withAuth(async (req, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, deletePantryItemsSchema)
  if (parseError) return parseError

  // Verify all IDs belong to this user/household
  const { data: owned, error: fetchError } = await db
    .from('pantry_items')
    .select('id, user_id, household_id')
    .in('id', body.ids)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const ownedIds = new Set((owned ?? []).map((r) => r.id))
  const allBelongToScope = (owned ?? []).every((r) => {
    if (ctx) return r.household_id === ctx.householdId
    return r.user_id === user.id
  })

  const allFound = body.ids.every((id) => ownedIds.has(id))
  if (!allBelongToScope || !allFound) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: deleteError } = await db
    .from('pantry_items')
    .delete()
    .in('id', body.ids)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
})
