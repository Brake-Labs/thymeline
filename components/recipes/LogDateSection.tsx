'use client'

import { useState } from 'react'
import { getTodayISO, addDays } from '@/lib/date-utils'
import DateInput from '@/components/ui/DateInput'
import { TOAST_DURATION_MS } from '@/lib/constants'

interface LogDateSectionProps {
  recipeId: string
  onLogged?: (date: string) => void
}

type Status = 'idle' | 'loading' | 'success' | 'already_logged' | 'picking'

function getToday(): string {
  return getTodayISO()
}

function getYesterday(): string {
  return addDays(getTodayISO(), -1)
}

const btnBase = 'font-display font-medium text-[13px] rounded-[4px] px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnPrimary = `${btnBase} bg-sage-500 text-[#FFFDF9] hover:bg-sage-600`
const btnSecondary = `${btnBase} border border-stone-200 text-[#3D3028] bg-transparent hover:bg-stone-50`

export default function LogDateSection({
  recipeId,
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
        },
        body: JSON.stringify({ madeOn: dateStr }),
      })
      if (res.ok) {
        const data: { madeOn: string; already_logged: boolean } = await res.json()
        setStatus(data.already_logged ? 'already_logged' : 'success')
        if (!data.already_logged) onLogged?.(data.madeOn)
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

  return (
    <div className="space-y-2">
      <p className="font-display text-[10px] font-bold uppercase tracking-[0.1em] text-sage-500">
        Log a date
      </p>
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
            <DateInput
              value={pickedDate}
              onChange={setPickedDate}
              max={getToday()}
              placeholder="Pick a date"
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
