import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { canManage } from '@/lib/household'

// ── DELETE /api/household/members/[user_id] — remove a member ────────────────

export const DELETE = withAuth(async (req, { user, db, ctx }, params) => {
  if (!ctx) {
    return NextResponse.json({ error: 'Not in a household' }, { status: 404 })
  }

  const isSelf = params.user_id === user.id

  // Non-self removal requires canManage
  if (!isSelf && !canManage(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch target member
  const { data: target } = await db
    .from('household_members')
    .select('role')
    .eq('household_id', ctx.householdId)
    .eq('user_id', params.user_id)
    .single()

  if (!target) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  // co_owner cannot remove owner
  if (target.role === 'owner' && !isSelf) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Owner cannot leave without transferring ownership
  if (target.role === 'owner' && isSelf) {
    return NextResponse.json(
      { error: 'Transfer ownership first before leaving' },
      { status: 400 },
    )
  }

  const { error: deleteError } = await db
    .from('household_members')
    .delete()
    .eq('household_id', ctx.householdId)
    .eq('user_id', params.user_id)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
})

// ── PATCH /api/household/members/[user_id] — change role (owner only) ─────────

export const PATCH = withAuth(async (req, { user, db, ctx }, params) => {
  if (!ctx) {
    return NextResponse.json({ error: 'Not in a household' }, { status: 404 })
  }
  if (ctx.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can change roles' }, { status: 403 })
  }

  let body: { role?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const validRoles = ['co_owner', 'member']
  if (!body.role || !validRoles.includes(body.role)) {
    return NextResponse.json(
      { error: 'role must be one of: co_owner, member' },
      { status: 400 },
    )
  }

  const { error: updateError } = await db
    .from('household_members')
    .update({ role: body.role })
    .eq('household_id', ctx.householdId)
    .eq('user_id', params.user_id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }

  return NextResponse.json({ user_id: params.user_id, role: body.role })
})
