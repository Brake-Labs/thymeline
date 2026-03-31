import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'

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
export const POST = withAuth(async (req, { user, db }) => {
  // Check whether a preferences row exists for this user
  const { error: prefsError } = await db
    .from('user_preferences')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  // PGRST116 = no row found — user was never provisioned, deny reactivation
  if (prefsError?.code === 'PGRST116') {
    return NextResponse.json({ error: 'Not eligible for reactivation' }, { status: 403 })
  }
  if (prefsError) {
    return NextResponse.json({ error: prefsError.message }, { status: 500 })
  }

  const { error } = await db
    .from('user_preferences')
    .update({ is_active: true })
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
})
