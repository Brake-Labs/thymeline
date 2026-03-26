import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import type { PantryItem } from '@/types'

interface RouteContext {
  params: { id: string }
}

// ── PATCH /api/pantry/[id] ────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { quantity?: string | null; expiry_date?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const db = createAdminClient()

  // Build update payload — only include fields that were provided
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('quantity' in body) updates.quantity = body.quantity ?? null
  if ('expiry_date' in body) updates.expiry_date = body.expiry_date ?? null

  const { data, error } = await db
    .from('pantry_items')
    .update(updates)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ item: data as PantryItem })
}

// ── DELETE /api/pantry/[id] ───────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Verify ownership before deleting
  const { data: item, error: fetchError } = await db
    .from('pantry_items')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error: deleteError } = await db
    .from('pantry_items')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
