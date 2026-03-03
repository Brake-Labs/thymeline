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

  // Fetch preferences to check active status and onboarding
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('is_active, onboarding_completed')
    .eq('user_id', user.id)
    .single()

  // Inactive users (no valid invite) are blocked
  if (prefs?.is_active === false) {
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
