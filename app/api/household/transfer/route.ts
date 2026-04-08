import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { transferOwnershipSchema, parseBody } from '@/lib/schemas'
import { db } from '@/lib/db'
import { householdMembers, households } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { dbFirst } from '@/lib/db/helpers'

// ── POST /api/household/transfer — transfer ownership ─────────────────────────

export const POST = withAuth(async (req, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, transferOwnershipSchema)
  if (parseError) return parseError

  if (!ctx) {
    return NextResponse.json({ error: 'Not in a household' }, { status: 404 })
  }
  if (ctx.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can transfer ownership' }, { status: 403 })
  }

  // Verify newOwnerId is a member of this household
  const targetRows = await db
    .select({
      userId: householdMembers.userId,
      role: householdMembers.role,
    })
    .from(householdMembers)
    .where(and(
      eq(householdMembers.householdId, ctx.householdId),
      eq(householdMembers.userId, body.newOwnerId),
    ))

  const targetMember = dbFirst(targetRows)

  if (!targetMember) {
    return NextResponse.json({ error: 'newOwnerId is not a member of this household' }, { status: 400 })
  }

  try {
    // Update new owner role to 'owner'
    await db
      .update(householdMembers)
      .set({ role: 'owner' })
      .where(and(
        eq(householdMembers.householdId, ctx.householdId),
        eq(householdMembers.userId, body.newOwnerId),
      ))

    // Demote current owner to 'co_owner'
    await db
      .update(householdMembers)
      .set({ role: 'co_owner' })
      .where(and(
        eq(householdMembers.householdId, ctx.householdId),
        eq(householdMembers.userId, user.id),
      ))

    // Update households.ownerId
    await db
      .update(households)
      .set({ ownerId: body.newOwnerId })
      .where(eq(households.id, ctx.householdId))

    return NextResponse.json({ newOwnerId: body.newOwnerId, previous_owner_id: user.id })
  } catch (err) {
    console.error('[POST /api/household/transfer] error:', err)
    return NextResponse.json({ error: 'Failed to transfer ownership' }, { status: 500 })
  }
})
