import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

// Auth stub: assumes a valid session token is passed via cookie or header.
// Real auth UI will be wired up in a future brief.
// For now, we check for a session using the Supabase anon key and redirect
// to /onboarding if the user has not completed it.

async function getPreferences(token: string | null) {
  if (!token) return null
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {},
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('user_preferences')
    .select('onboarding_completed')
    .eq('user_id', user.id)
    .single()

  return data
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = headers()
  const pathname = headersList.get('x-pathname') ?? ''
  const authorization = headersList.get('authorization')
  const token = authorization?.replace('Bearer ', '') ?? null

  // Fetch preferences to check onboarding status
  const prefs = await getPreferences(token)

  // Redirect to onboarding if not completed, but avoid redirect loops
  if (prefs && prefs.onboarding_completed === false && !pathname.startsWith('/onboarding')) {
    redirect('/onboarding')
  }

  return <>{children}</>
}
