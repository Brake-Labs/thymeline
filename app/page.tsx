import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Root route: redirect authenticated users to /home, others to /login
export default async function RootPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/home')
  } else {
    redirect('/login')
  }
}
