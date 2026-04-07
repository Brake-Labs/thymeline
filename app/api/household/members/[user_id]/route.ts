import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { updateMemberRoleSchema, parseBody } from '@/lib/schemas'
import { canManage } from '@/lib/household'
import { db } from '@/lib/db'
import { householdMembers } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { dbFirst } from '@/lib/db/helpers'

// ── DELETE /api/household/members/[user_id] — remove a member ────────────────

export const DELETE = withAuth(async (req, { user, ctx }, params) => {
  if (!ctx) {
    return NextResponse.json({ error: 'Not in a household' }, { status: 404 })
  }

  // "me" is a convenience alias for the authenticated user's own ID
  const targetUserId = params.user_id === 'me' ? user.id : params.user_id!
  const isSelf = targetUserId === user.id

  // Non-self removal requires canManage
  if (!isSelf && !canManage(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch target member
  const targetRows = await db
    .select({ role: householdMembers.role })
    .from(householdMembers)
    .where(and(
      eq(householdMembers.householdId, ctx.householdId),
      eq(householdMembers.userId, targetUserId),
    ))

  const target = dbFirst(targetRows)

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

  try {
    await db
      .delete(householdMembers)
      .where(and(
        eq(householdMembers.householdId, ctx.householdId),
        eq(householdMembers.userId, targetUserId),
      ))

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/household/members] error:', err)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
})

// ── PATCH /api/household/members/[user_id] — change role (owner only) ─────────

export const PATCH = withAuth(async (req, { ctx }, params) => {
  if (!ctx) {
    return NextResponse.json({ error: 'Not in a household' }, { status: 404 })
  }
  if (ctx.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can change roles' }, { status: 403 })
  }

  const { data: body, error: parseError } = await parseBody(req, updateMemberRoleSchema)
  if (parseError) return parseError

  try {
    await db
      .update(householdMembers)
      .set({ role: body.role })
      .where(and(
        eq(householdMembers.householdId, ctx.householdId),
        eq(householdMembers.userId, params.user_id!),
      ))

    return NextResponse.json({ user_id: params.user_id!, role: body.role })
  } catch (err) {
    console.error('[PATCH /api/household/members] error:', err)
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }
})
