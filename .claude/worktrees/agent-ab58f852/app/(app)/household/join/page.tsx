'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useHousehold } from '@/lib/household-context'

export default function JoinHouseholdPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { refresh } = useHousehold()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'validating' | 'valid' | 'invalid' | 'joining' | 'done' | 'error'>('validating')
  const [householdName, setHouseholdName] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      return
    }
    fetch(`/api/household/invite/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) {
          setHouseholdName(d.household_name)
          setStatus('valid')
        } else {
          setStatus('invalid')
        }
      })
      .catch(() => setStatus('invalid'))
  }, [token])

  async function handleJoin() {
    if (!token) return
    setStatus('joining')
    try {
      const res = await fetch('/api/household/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) {
        await refresh()
        setStatus('done')
        setTimeout(() => router.push('/'), 1500)
      } else {
        const d = await res.json()
        setErrorMsg(d.error ?? 'Failed to join household')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-8 shadow-sm space-y-6">
        <h1 className="text-xl font-semibold text-center">Join a Household</h1>

        {status === 'validating' && (
          <p className="text-sm text-center text-stone-500">Validating invite…</p>
        )}

        {status === 'invalid' && (
          <p className="text-sm text-center text-red-600">
            This invite link is invalid, expired, or has already been used.
          </p>
        )}

        {status === 'valid' && householdName && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-stone-700">
              You have been invited to join <span className="font-semibold">{householdName}</span>.
            </p>
            <p className="text-xs text-stone-500">
              Your existing recipes, pantry items, and custom tags will be shared with this household.
            </p>
            <button
              onClick={handleJoin}
              className="w-full rounded-md bg-sage-500 px-4 py-2 text-sm font-medium text-white hover:bg-sage-600"
            >
              Accept &amp; join
            </button>
          </div>
        )}

        {status === 'joining' && (
          <p className="text-sm text-center text-stone-500">Joining…</p>
        )}

        {status === 'done' && (
          <p className="text-sm text-center text-sage-600">
            You have joined the household! Redirecting…
          </p>
        )}

        {status === 'error' && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-red-600">{errorMsg}</p>
            <button
              onClick={() => router.push('/')}
              className="text-sm text-sage-500 hover:text-sage-700"
            >
              Go home
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
