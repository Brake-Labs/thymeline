import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSessionUser } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { userPreferences } from '@/lib/db/schema'
import AppNav from '@/components/layout/AppNav'
import { HouseholdProvider } from '@/lib/household-context'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  if (!user) {
    redirect('/login')
  }

  // Check isActive and onboarding status via direct DB query
  const prefs = await db
    .select({
      isActive: userPreferences.isActive,
      onboardingCompleted: userPreferences.onboardingCompleted,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id))
    .limit(1)

  const userPrefs = prefs[0]

  if (userPrefs && userPrefs.isActive === false) {
    redirect('/inactive')
  }

  // New users must complete onboarding
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') ?? ''
  if (userPrefs?.onboardingCompleted === false && !pathname.startsWith('/onboarding')) {
    redirect('/onboarding')
  }

  return (
    <HouseholdProvider>
      <AppNav />
      <main>{children}</main>
    </HouseholdProvider>
  )
}
