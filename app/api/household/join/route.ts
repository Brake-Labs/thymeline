import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { joinHouseholdSchema, parseBody } from '@/lib/schemas'
import { db } from '@/lib/db'
import { householdInvites, households, householdMembers, recipes, pantryItems, customTags, userPreferences } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { dbFirst } from '@/lib/db/helpers'

// ── POST /api/household/join — consume invite and join ────────────────────────

export const POST = withAuth(async (req, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, joinHouseholdSchema)
  if (parseError) return parseError

  // Check if already in a household
  if (ctx) {
    return NextResponse.json({ error: 'Already in a household.' }, { status: 409 })
  }

  try {
    // Fetch and validate invite
    const inviteRows = await db
      .select({
        id: householdInvites.id,
        householdId: householdInvites.householdId,
        used_by: householdInvites.usedBy,
        expires_at: householdInvites.expiresAt,
      })
      .from(householdInvites)
      .where(eq(householdInvites.token, body.token))

    const invite = dbFirst(inviteRows)

    if (!invite) {
      return NextResponse.json({ error: 'Invalid invite token' }, { status: 400 })
    }
    if (invite.used_by !== null) {
      return NextResponse.json({ error: 'Invite has already been used' }, { status: 400 })
    }
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite has expired' }, { status: 400 })
    }

    // Fetch target household
    const householdRows = await db
      .select({ id: households.id, name: households.name })
      .from(households)
      .where(eq(households.id, invite.householdId))

    const household = dbFirst(householdRows)

    if (!household) {
      return NextResponse.json({ error: 'Household not found' }, { status: 400 })
    }

    // Insert member row (unique index enforces one-household-per-user at DB level)
    try {
      await db
        .insert(householdMembers)
        .values({ householdId: household.id, userId: user.id, role: 'member' })
    } catch (err) {
      // Check for unique constraint violation
      if (err instanceof Error && err.message.includes('23505')) {
        return NextResponse.json({ error: 'Already in a household.' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to join household' }, { status: 500 })
    }

    // Mark invite as used
    await db
      .update(householdInvites)
      .set({ usedBy: user.id })
      .where(eq(householdInvites.id, invite.id))

    // Data migration: copy solo recipes, pantry_items, and custom_tags into the household
    await db
      .update(recipes)
      .set({ householdId: household.id })
      .where(and(eq(recipes.userId, user.id), isNull(recipes.householdId)))

    await db
      .update(pantryItems)
      .set({ householdId: household.id })
      .where(and(eq(pantryItems.userId, user.id), isNull(pantryItems.householdId)))

    await db
      .update(customTags)
      .set({ householdId: household.id })
      .where(and(eq(customTags.userId, user.id), isNull(customTags.householdId)))

    // Copy user preferences into household if no household preferences exist yet
    const existingHouseholdPrefsRows = await db
      .select({ id: userPreferences.id })
      .from(userPreferences)
      .where(eq(userPreferences.householdId, household.id))
      .limit(1)

    if (existingHouseholdPrefsRows.length === 0) {
      const userPrefsRows = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, user.id))

      const userPrefsRow = dbFirst(userPrefsRows)

      if (userPrefsRow) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring to remove id before re-inserting
        const { id: _id, ...prefsWithoutId } = userPrefsRow
        await db
          .insert(userPreferences)
          .values({ ...prefsWithoutId, householdId: household.id })
          .onConflictDoUpdate({
            target: userPreferences.userId,
            set: { householdId: household.id },
          })
      }
    }

    return NextResponse.json({ householdId: household.id, household_name: household.name })
  } catch (err) {
    console.error('[POST /api/household/join] error:', err)
    return NextResponse.json({ error: 'Failed to join household' }, { status: 500 })
  }
})
