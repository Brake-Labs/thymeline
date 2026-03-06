'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient, getAccessToken } from '@/lib/supabase/browser'

export default function AuthCompletePage() {
  const router = useRouter()

  useEffect(() => {
    async function handleAuthComplete() {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Auth failed — redirect to login
        router.push('/login')
        return
      }

      const token = await getAccessToken()

      // Fetch preferences to check onboarding status
      const prefsRes = await fetch('/api/preferences', {
        headers: { Authorization: `Bearer ${token}` },
      })
      let prefs = prefsRes.ok ? await prefsRes.json() : null
      if (!prefs) {
        await new Promise(r => setTimeout(r, 500))
        const retry = await fetch('/api/preferences', {
          headers: { Authorization: `Bearer ${token}` },
        })
        prefs = retry.ok ? await retry.json() : null
      }

      if (prefs?.onboarding_completed === true) {
        // Returning user — skip invite check
        router.push('/home')
        return
      }

      // New user — check and consume invite token
      const inviteToken = sessionStorage.getItem('forkcast_invite_token') ?? null

      const consumeRes = await fetch('/api/invite/consume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token: inviteToken }),
      })
      const consumeData = consumeRes.ok ? await consumeRes.json() : { success: false }

      if (consumeData.success) {
        sessionStorage.removeItem('forkcast_invite_token')
        router.push('/onboarding')
      } else {
        router.push('/inactive')
      }
    }

    handleAuthComplete()
  }, [router])

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-emerald-600" />
        <p className="text-stone-500 text-sm">Getting things ready…</p>
      </div>
    </div>
  )
}
