import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { createHouseholdSchema, parseBody } from '@/lib/schemas'
import { canManage } from '@/lib/household'
import { db } from '@/lib/db'
import { households, householdMembers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { dbFirst } from '@/lib/db/helpers'
import type { HouseholdMember } from '@/types'

// ── POST /api/household — create a new household ──────────────────────────────

export const POST = withAuth(async (req, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, createHouseholdSchema)
  if (parseError) return parseError

  if (ctx) {
    return NextResponse.json({ error: 'Already in a household.' }, { status: 409 })
  }

  try {
    const householdRows = await db
      .insert(households)
      .values({ name: body.name, ownerId: user.id })
      .returning()

    const household = dbFirst(householdRows)
    if (!household) {
      return NextResponse.json({ error: 'Failed to create household' }, { status: 500 })
    }

    await db
      .insert(householdMembers)
      .values({ householdId: household.id, userId: user.id, role: 'owner' })

    return NextResponse.json(household, { status: 201 })
  } catch (err) {
    console.error('[POST /api/household] error:', err)
    return NextResponse.json({ error: 'Failed to create household' }, { status: 500 })
  }
})

// ── GET /api/household — get current user's household and members ─────────────

export const GET = withAuth(async (req, { ctx }) => {
  if (!ctx) {
    return NextResponse.json({ household: null })
  }

  try {
    const householdRows = await db
      .select()
      .from(households)
      .where(eq(households.id, ctx.householdId))

    const household = dbFirst(householdRows)

    const members = await db
      .select({
        householdId: householdMembers.householdId,
        userId: householdMembers.userId,
        role: householdMembers.role,
        joinedAt: householdMembers.joinedAt,
      })
      .from(householdMembers)
      .where(eq(householdMembers.householdId, ctx.householdId))

    // Note: email enrichment via admin auth API is not available with Drizzle/Better Auth.
    // Return members without email enrichment. Convert Date to ISO string for API response.
    const enrichedMembers: HouseholdMember[] = members.map((m) => ({
      ...m,
      joinedAt: m.joinedAt.toISOString(),
    })) as HouseholdMember[]

    return NextResponse.json({ household, members: enrichedMembers, myRole: ctx.role })
  } catch (err) {
    console.error('[GET /api/household] error:', err)
    return NextResponse.json({ error: 'Failed to fetch household' }, { status: 500 })
  }
})

// ── PATCH /api/household — update household name ──────────────────────────────

export const PATCH = withAuth(async (req, { ctx }) => {
  if (!ctx) {
    return NextResponse.json({ error: 'Not in a household' }, { status: 404 })
  }
  if (!canManage(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: body, error: parseError } = await parseBody(req, createHouseholdSchema)
  if (parseError) return parseError

  try {
    const rows = await db
      .update(households)
      .set({ name: body.name })
      .where(eq(households.id, ctx.householdId))
      .returning()

    const updated = dbFirst(rows)
    if (!updated) {
      return NextResponse.json({ error: 'Failed to update household' }, { status: 500 })
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PATCH /api/household] error:', err)
    return NextResponse.json({ error: 'Failed to update household' }, { status: 500 })
  }
})

// ── DELETE /api/household — delete the household (owner only) ─────────────────

export const DELETE = withAuth(async (req, { ctx }) => {
  if (!ctx) {
    return NextResponse.json({ error: 'Not in a household' }, { status: 404 })
  }
  if (ctx.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can delete the household' }, { status: 403 })
  }

  try {
    await db
      .delete(households)
      .where(eq(households.id, ctx.householdId))

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/household] error:', err)
    return NextResponse.json({ error: 'Failed to delete household' }, { status: 500 })
  }
})
