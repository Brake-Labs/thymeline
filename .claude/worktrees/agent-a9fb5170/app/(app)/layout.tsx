import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import AppNav from '@/components/layout/AppNav'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createSupabaseServerClient()

  // Verify session
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Check is_active from user_metadata first — set by auth/complete after
  // successful invite or returning-user validation. This avoids DB reads and
  // eliminates the RLS race condition that caused the /inactive redirect bug.
  const metaActive = user.user_metadata?.is_active

  if (metaActive === false) {
    redirect('/inactive')
  }

  // Fetch preferences for onboarding check (and legacy is_active fallback)
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('is_active, onboarding_completed')
    .eq('user_id', user.id)
    .single()

  // Legacy fallback: metadata not yet set (user hasn't re-authed since this deploy)
  if (metaActive === undefined && prefs?.is_active === false) {
    redirect('/inactive')
  }

  // New users must complete onboarding
  const headersList = headers()
  const pathname = headersList.get('x-pathname') ?? ''
  if (prefs?.onboarding_completed === false && !pathname.startsWith('/onboarding')) {
    redirect('/onboarding')
  }

  return (
    <>
      <AppNav />
      <main>{children}</main>
    </>
  )
}
