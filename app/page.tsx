import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-helpers'

// Root route: redirect authenticated users to /home, others to /login
export default async function RootPage() {
  const user = await getSessionUser()

  if (user) {
    redirect('/home')
  } else {
    redirect('/login')
  }
}
