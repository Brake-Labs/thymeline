import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { parseIngredientLine, assignSection } from '@/lib/grocery'
import type { PantryItem } from '@/types'

// ── GET /api/pantry ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const { data, error } = await db
    .from('pantry_items')
    .select('*')
    .eq('user_id', user.id)
    .order('section', { nullsFirst: false })
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data as PantryItem[] })
}

// ── POST /api/pantry ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { name?: string; quantity?: string; section?: string; expiry_date?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Free-text parsing: extract leading amount + unit token from the name field
  const parsed = parseIngredientLine(body.name.trim())

  let name: string
  let quantity: string | null

  if (parsed.rawName && parsed.rawName.trim()) {
    name = parsed.rawName.trim()
    // Format amount + unit back into freeform quantity string
    const parsedQty = [
      parsed.amount !== null ? String(parsed.amount) : null,
      parsed.unit ?? null,
    ].filter(Boolean).join(' ')

    // Only use parsed quantity if caller didn't provide one
    quantity = body.quantity !== undefined ? body.quantity : (parsedQty || null)
  } else {
    // Entire string was a number — store original as name with no quantity
    name = body.name.trim()
    quantity = body.quantity !== undefined ? body.quantity : null
  }

  // Auto-assign section unless caller provided one
  const section = body.section !== undefined ? body.section : assignSection(name)

  const db = createAdminClient()
  const { data, error } = await db
    .from('pantry_items')
    .insert({
      user_id:     user.id,
      name,
      quantity,
      section,
      expiry_date: body.expiry_date ?? null,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data as PantryItem }, { status: 201 })
}

// ── DELETE /api/pantry (bulk) ─────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { ids?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
  }

  const db = createAdminClient()

  // Verify all IDs belong to the authenticated user
  const { data: owned, error: fetchError } = await db
    .from('pantry_items')
    .select('id, user_id')
    .in('id', body.ids)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const ownedIds = new Set((owned ?? []).map((r: { id: string; user_id: string }) => r.id))
  const allBelongToUser = (owned ?? []).every((r: { id: string; user_id: string }) => r.user_id === user.id)

  // If any ID belongs to another user, or wasn't found (could be another user's)
  const allFound = body.ids.every((id) => ownedIds.has(id))
  if (!allBelongToUser || !allFound) {
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
}
