import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { updatePantryItemSchema, parseBody } from '@/lib/schemas'
import { scopeQuery } from '@/lib/household'
import type { PantryItem } from '@/types'

// ── PATCH /api/pantry/[id] ────────────────────────────────────────────────────

export const PATCH = withAuth(async (req, { user, db, ctx }, params) => {
  const { data: body, error: parseError } = await parseBody(req, updatePantryItemSchema)
  if (parseError) return parseError

  // Build update payload — only include fields that were provided
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('quantity' in body) updates.quantity = body.quantity ?? null
  if ('expiry_date' in body) updates.expiry_date = body.expiry_date ?? null

  let updateQ = db.from('pantry_items').update(updates).eq('id', params.id)
  updateQ = scopeQuery(updateQ, user.id, ctx)
  const { data, error } = await updateQ.select('*').single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ item: data as PantryItem })
})

// ── DELETE /api/pantry/[id] ───────────────────────────────────────────────────

export const DELETE = withAuth(async (req, { user, db, ctx }, params) => {
  // Verify ownership before deleting
  let fetchQ = db.from('pantry_items').select('id').eq('id', params.id)
  fetchQ = scopeQuery(fetchQ, user.id, ctx)
  const { data: item, error: fetchError } = await fetchQ.single()

  if (fetchError || !item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let deleteQ = db.from('pantry_items').delete().eq('id', params.id)
  deleteQ = scopeQuery(deleteQ, user.id, ctx)
  const { error: deleteError } = await deleteQ

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
})
