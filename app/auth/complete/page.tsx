'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export default function AuthCompletePage() {
  const router = useRouter()

  useEffect(() => {
    async function handleAuthComplete() {
      const session = await authClient.getSession()

      if (!session?.data?.user) {
        router.push('/login')
        return
      }

      // Check if user already has preferences (cookies sent automatically)
      const prefsRes = await fetch('/api/preferences')
      const prefs = prefsRes.ok ? await prefsRes.json() : null

      if (prefs && (prefs.onboarding_completed === true || prefs.is_active === true)) {
        // Returning user with completed setup
        router.push('/home')
        return
      }

      if (!prefs) {
        // New user — create default preferences
        await fetch('/api/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      }

      // Send to onboarding
      router.push('/onboarding')
    }

    handleAuthComplete()
  }, [router])

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-sage-500" />
        <p className="text-stone-500 text-sm">Getting things ready…</p>
      </div>
    </div>
  )
}
