import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth-helpers'
import { config } from '@/lib/config'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  if (!user) {
    redirect('/login')
  }

  const admins = config.adminEmails
  if (!admins.includes(user.email.toLowerCase())) {
    redirect('/home')
  }

  return <>{children}</>
}
