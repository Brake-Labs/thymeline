import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { createHouseholdSchema, parseBody } from '@/lib/schemas'
import { canManage } from '@/lib/household'
import type { HouseholdMember } from '@/types'

// ── POST /api/household — create a new household ──────────────────────────────

export const POST = withAuth(async (req, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, createHouseholdSchema)
  if (parseError) return parseError

  if (ctx) {
    return NextResponse.json({ error: 'Already in a household.' }, { status: 409 })
  }

  const { data: household, error: householdError } = await db
    .from('households')
    .insert({ name: body.name, owner_id: user.id })
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

  return NextResponse.json(household, { status: 201 })
})

// ── GET /api/household — get current user's household and members ─────────────

export const GET = withAuth(async (req, { db, ctx }) => {
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
    enrichedMembers = (members ?? []).map((m) => ({
      ...m,
      email: userMap.get(m.user_id) ?? undefined,
    })) as HouseholdMember[]
  } catch {
    // auth.admin not available in all environments; return without emails
  }

  return NextResponse.json({ household, members: enrichedMembers, myRole: ctx.role })
})

// ── PATCH /api/household — update household name ──────────────────────────────

export const PATCH = withAuth(async (req, { db, ctx }) => {
  if (!ctx) {
    return NextResponse.json({ error: 'Not in a household' }, { status: 404 })
  }
  if (!canManage(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: body, error: parseError } = await parseBody(req, createHouseholdSchema)
  if (parseError) return parseError

  const { data: updated, error: updateError } = await db
    .from('households')
    .update({ name: body.name })
    .eq('id', ctx.householdId)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update household' }, { status: 500 })
  }

  return NextResponse.json(updated)
})

// ── DELETE /api/household — delete the household (owner only) ─────────────────

export const DELETE = withAuth(async (req, { db, ctx }) => {
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
})
