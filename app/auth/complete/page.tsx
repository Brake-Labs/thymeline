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

      // Preferences fetch errored — unknown state, do not attempt invite consume
      if (!prefs) {
        router.push('/login')
        return
      }

      // Provisioned user: onboarding_completed=true (normal returning user) OR
      // is_active=true (doubly-corrupted user whose row was repaired by migration 007
      // but whose onboarding_completed was also reset by the pre-hotfix-11 bug).
      // Both signals mean the user has a user_preferences row and was legitimately
      // provisioned — skip consume (which would call setInactive and undo the repair).
      if (prefs.onboarding_completed === true || prefs.is_active === true) {
        // Stamp user_metadata so the layout never needs to hit the DB for this
        await supabase.auth.updateUser({ data: { is_active: true } })
        router.push('/home')
        return
      }

      // New user (no preferences row → DEFAULT_PREFS with is_active=false) —
      // check and consume invite token
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
        // Stamp user_metadata before sending to onboarding
        await supabase.auth.updateUser({ data: { is_active: true } })
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
