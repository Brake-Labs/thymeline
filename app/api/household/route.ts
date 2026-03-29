import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { resolveHouseholdScope, canManage } from '@/lib/household'
import type { Household, HouseholdMember } from '@/types'

// ── POST /api/household — create a new household ──────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const db = createAdminClient()
  const ctx = await resolveHouseholdScope(db, user.id)
  if (ctx) {
    return NextResponse.json({ error: 'Already in a household.' }, { status: 409 })
  }

  const { data: household, error: householdError } = await db
    .from('households')
    .insert({ name: body.name.trim(), owner_id: user.id })
    .select()
    .single()

  if (householdError || !household) {
    return NextResponse.json({ error: 'Failed to create household' }, { status: 500 })
  }

  const { error: memberError } = await db
    .from('household_members')
    .insert({ household_id: household.id, user_id: user.id, role: 'owner' })

  if (memberError) {
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
  }

  return NextResponse.json(household as Household, { status: 201 })
}

// ── GET /api/household — get current user's household and members ─────────────

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient(req)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[GET /api/household] called for user:', user.id)

    const db = createAdminClient()
    const ctx = await resolveHouseholdScope(db, user.id)
    if (!ctx) {
      return NextResponse.json({ household: null })
    }

    const { data: household } = await db
      .from('households')
      .select('*')
      .eq('id', ctx.householdId)
      .single()

    const { data: members } = await db
      .from('household_members')
      .select('household_id, user_id, role, joined_at')
      .eq('household_id', ctx.householdId)

    // Attempt to enrich with email via admin auth API
    let enrichedMembers: HouseholdMember[] = (members ?? []) as HouseholdMember[]
    try {
      const { data: usersPage } = await db.auth.admin.listUsers({ perPage: 1000 })
      const userMap = new Map(
        (usersPage?.users ?? []).map((u: { id: string; email?: string }) => [u.id, u.email]),
      )
      enrichedMembers = (members ?? []).map((m: { household_id: string; user_id: string; role: string; joined_at: string }) => ({
        ...m,
        email: userMap.get(m.user_id) ?? undefined,
      })) as HouseholdMember[]
    } catch {
      // auth.admin not available in all environments; return without emails
    }

    return NextResponse.json({ household: household as Household, members: enrichedMembers, myRole: ctx.role })
  } catch (err) {
    console.error('[GET /api/household] error:', err)
    return NextResponse.json({ household: null, members: [], myRole: null })
  }
}

// ── PATCH /api/household — update household name ──────────────────────────────

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const ctx = await resolveHouseholdScope(db, user.id)
  if (!ctx) {
    return NextResponse.json({ error: 'Not in a household' }, { status: 404 })
  }
  if (!canManage(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await db
    .from('households')
    .update({ name: body.name.trim() })
    .eq('id', ctx.householdId)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update household' }, { status: 500 })
  }

  return NextResponse.json(updated as Household)
}

// ── DELETE /api/household — delete the household (owner only) ─────────────────

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const ctx = await resolveHouseholdScope(db, user.id)
  if (!ctx) {
    return NextResponse.json({ error: 'Not in a household' }, { status: 404 })
  }
  if (ctx.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can delete the household' }, { status: 403 })
  }

  const { error: deleteError } = await db
    .from('households')
    .delete()
    .eq('id', ctx.householdId)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete household' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
