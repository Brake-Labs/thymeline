'use client'

import { useState } from 'react'

interface LogMadeTodayButtonProps {
  recipeId: string
  getToken: () => string
  onLogged?: () => void
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
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (res.ok) {
        const data: { made_on: string; already_logged: boolean } = await res.json()
        if (data.already_logged) {
          setStatus('already_logged')
        } else {
          setStatus('success')
          onLogged?.()
        }
        // Reset after 2 seconds
        setTimeout(() => setStatus('idle'), 2000)
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
      <button className={`${baseClass} bg-green-100 text-green-700 focus:ring-green-500`} disabled>
        ✓ Logged!
      </button>
    )
  }

  if (status === 'already_logged') {
    return (
      <button className={`${baseClass} bg-yellow-50 text-yellow-700 focus:ring-yellow-400`} disabled>
        Already logged today
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading'}
      className={`${baseClass} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {status === 'loading' ? 'Logging…' : 'Log Made Today'}
    </button>
  )
}
