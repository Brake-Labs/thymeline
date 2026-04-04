'use client'

import { useState } from 'react'
import { getTodayISO, addDays } from '@/lib/date-utils'
import { TOAST_DURATION_MS } from '@/lib/constants'

interface LogDateSectionProps {
  recipeId: string
  getToken: () => Promise<string> | string
  onLogged?: (date: string) => void
}

type Status = 'idle' | 'loading' | 'success' | 'already_logged' | 'picking'

function getToday(): string {
  return getTodayISO()
}

function getYesterday(): string {
  return addDays(getTodayISO(), -1)
}

export default function LogDateSection({
  recipeId,
  getToken,
  onLogged,
}: LogDateSectionProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [pickedDate, setPickedDate] = useState('')

  async function logDate(dateStr: string) {
    setStatus('loading')
    try {
      const res = await fetch(`/api/recipes/${recipeId}/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify({ made_on: dateStr }),
      })
      if (res.ok) {
        const data: { made_on: string; already_logged: boolean } = await res.json()
        setStatus(data.already_logged ? 'already_logged' : 'success')
        if (!data.already_logged) onLogged?.(data.made_on)
        setTimeout(() => setStatus('idle'), TOAST_DURATION_MS)
      } else {
        setStatus('idle')
      }
    } catch {
      setStatus('idle')
    }
  }

  if (status === 'success') {
    return <p className="text-sm text-sage-600 font-medium">✓ Logged!</p>
  }

  if (status === 'already_logged') {
    return <p className="text-sm text-stone-500 font-medium">Already logged for that day</p>
  }

  const disabled = status === 'loading'

  const btnBase = 'py-2 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const btnPrimary = `${btnBase} bg-sage-500 text-white hover:bg-sage-600`
  const btnSecondary = `${btnBase} border border-stone-300 text-stone-700 hover:bg-stone-50`

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Log a date</p>
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={() => logDate(getToday())} disabled={disabled} className={btnPrimary}>
          Today
        </button>
        <button onClick={() => logDate(getYesterday())} disabled={disabled} className={btnSecondary}>
          Yesterday
        </button>

        {status !== 'picking' ? (
          <button
            onClick={() => setStatus('picking')}
            disabled={disabled}
            className={btnSecondary}
          >
            Pick a date
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={pickedDate}
              onChange={(e) => setPickedDate(e.target.value)}
              max={getToday()}
              className="border border-stone-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
            />
            <button
              onClick={() => { if (pickedDate) logDate(pickedDate) }}
              disabled={!pickedDate || disabled}
              className={btnPrimary}
            >
              Log
            </button>
            <button
              onClick={() => { setStatus('idle'); setPickedDate('') }}
              className="text-xs text-stone-400 hover:text-stone-600"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
