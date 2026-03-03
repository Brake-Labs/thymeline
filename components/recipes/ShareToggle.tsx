'use client'

import { useState } from 'react'

interface ShareToggleProps {
  recipeId: string
  initialIsShared: boolean
  getToken: () => string
  onUpdate: (isShared: boolean) => void
}

export default function ShareToggle({
  recipeId,
  initialIsShared,
  getToken,
  onUpdate,
}: ShareToggleProps) {
  const [isShared, setIsShared] = useState(initialIsShared)
  const [busy, setBusy] = useState(false)

  async function handleToggle() {
    const next = !isShared
    setBusy(true)
    try {
      const res = await fetch(`/api/recipes/${recipeId}/share`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ is_shared: next }),
      })
      if (res.ok) {
        setIsShared(next)
        onUpdate(next)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        role="switch"
        aria-checked={isShared}
        onClick={handleToggle}
        disabled={busy}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 ${
          isShared ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            isShared ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <span className="text-sm text-gray-700">Share with Forkcast community</span>
    </label>
  )
}
