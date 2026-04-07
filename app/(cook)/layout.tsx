import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-helpers'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { userPreferences } from '@/lib/db/schema'

export default async function CookLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) {
    redirect('/login')
  }

  const prefs = await db
    .select({ isActive: userPreferences.isActive })
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id))
    .limit(1)

  if (prefs[0] && prefs[0].isActive === false) {
    redirect('/inactive')
  }

  return <>{children}</>
}
