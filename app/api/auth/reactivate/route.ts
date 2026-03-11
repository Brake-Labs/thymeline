import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

/**
 * Restores is_active = true for a user whose onboarding_completed = true.
 * Called by auth/complete when a returning user's is_active was incorrectly
 * set to false by a previous failed invite-consume attempt.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only reactivate if the user has genuinely completed onboarding
  const { data: prefs, error: prefsError } = await supabase
    .from('user_preferences')
    .select('onboarding_completed')
    .eq('user_id', user.id)
    .single()

  if (prefsError || !prefs?.onboarding_completed) {
    return NextResponse.json({ error: 'Not eligible for reactivation' }, { status: 403 })
  }

  const { error } = await supabase
    .from('user_preferences')
    .update({ is_active: true })
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
