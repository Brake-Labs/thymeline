import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { userPreferences } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Restores is_active = true for a user who was previously provisioned.
 * Eligibility: a user_preferences row must exist.
 *
 * A row only exists if the user was provisioned — either by the pre-hotfix-11
 * DB trigger on signup, or by a successful POST /api/invite/consume. Users who
 * signed up after hotfix-11 without a valid invite have no row (setInactive is
 * an UPDATE that no-ops on missing rows), so they are correctly denied.
 *
 * This handles accounts where both onboarding_completed and is_active were
 * corrupted to false by the old plain-upsert bug in invite/consume.
 */
export const POST = withAuth(async (req, { user }) => {
  try {
    // Check whether a preferences row exists for this user
    const prefsRows = await db
      .select({ userId: userPreferences.userId })
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id))

    // No row found — user was never provisioned, deny reactivation
    if (prefsRows.length === 0) {
      return NextResponse.json({ error: 'Not eligible for reactivation' }, { status: 403 })
    }

    await db
      .update(userPreferences)
      .set({ isActive: true })
      .where(eq(userPreferences.userId, user.id))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/auth/reactivate] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
})
