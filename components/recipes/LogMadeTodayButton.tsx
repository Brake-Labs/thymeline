'use client'

import { useState } from 'react'
import { TOAST_DURATION_MS } from '@/lib/constants'

interface LogMadeTodayButtonProps {
  recipeId: string
  getToken: () => Promise<string> | string
  onLogged?: (entryId: string | null) => void
}

type Status = 'idle' | 'loading' | 'success' | 'already_logged'

export default function LogMadeTodayButton({
  recipeId,
  getToken,
  onLogged,
}: LogMadeTodayButtonProps) {
  const [status, setStatus] = useState<Status>('idle')

  async function handleClick() {
    setStatus('loading')
    try {
      const res = await fetch(`/api/recipes/${recipeId}/log`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getToken()}` },
      })
      if (res.ok) {
        const data: { made_on: string; already_logged: boolean; entry_id: string | null } = await res.json()
        if (data.already_logged) {
          setStatus('already_logged')
        } else {
          setStatus('success')
          onLogged?.(data.entry_id ?? null)
        }
        // Reset after toast duration
        setTimeout(() => setStatus('idle'), TOAST_DURATION_MS)
      } else {
        setStatus('idle')
      }
    } catch {
      setStatus('idle')
    }
  }

  const baseClass =
    'min-w-[11rem] py-3 px-5 rounded-lg font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2'

  if (status === 'success') {
    return (
      <button className={`${baseClass} bg-sage-100 text-sage-700 focus:ring-sage-500`} disabled>
        ✓ Logged!
      </button>
    )
  }

  if (status === 'already_logged') {
    return (
      <button className={`${baseClass} bg-stone-50 text-stone-600 focus:ring-stone-400`} disabled>
        Already logged today
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading'}
      className={`${baseClass} bg-sage-500 text-white hover:bg-sage-600 focus:ring-sage-500 disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {status === 'loading' ? 'Logging…' : 'Log Made Today'}
    </button>
  )
}
