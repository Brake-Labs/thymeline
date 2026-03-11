import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

/**
 * Restores is_active = true for a user who was previously active.
 * Eligibility: onboarding_completed = true OR any recipes in the DB
 * (handles accounts corrupted by the pre-hotfix-11 upsert that reset
 * onboarding_completed = false on every failed auth/complete attempt).
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check both signals of prior app usage in parallel
  const [prefsResult, recipesResult] = await Promise.all([
    supabase
      .from('user_preferences')
      .select('onboarding_completed')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('recipes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ])

  const completedOnboarding = prefsResult.data?.onboarding_completed === true
  const hasRecipes = (recipesResult.count ?? 0) > 0

  if (!completedOnboarding && !hasRecipes) {
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
