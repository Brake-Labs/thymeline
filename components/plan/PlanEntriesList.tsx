'use client'

import { useState } from 'react'
import MakeAgainPrompt from '@/components/recipes/MakeAgainPrompt'
import { TOAST_DURATION_MS } from '@/lib/constants'

interface PlanEntry {
  plannedDate:  string
  recipeId:     string
  recipeTitle:  string
  confirmed:     boolean
  dateLabel:     string
}

interface Props {
  entries: PlanEntry[]
}

interface EntryState {
  status: 'idle' | 'loading' | 'success' | 'alreadyLogged'
  makeAgainEntryId: string | null
}

export default function PlanEntriesList({ entries }: Props) {
  const [entryStates, setEntryStates] = useState<Record<string, EntryState>>(() =>
    Object.fromEntries(entries.map((e) => [`${e.plannedDate}-${e.recipeId}`, { status: 'idle', makeAgainEntryId: null }]))
  )

  function getKey(entry: PlanEntry) {
    return `${entry.plannedDate}-${entry.recipeId}`
  }

  async function handleLog(entry: PlanEntry) {
    const key = getKey(entry)
    setEntryStates((prev) => ({ ...prev, [key]: { ...prev[key]!, status: 'loading', makeAgainEntryId: null } }))
    try {
      const res = await fetch(`/api/recipes/${entry.recipeId}/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ madeOn: entry.plannedDate }),
      })
      if (res.ok) {
        const data: { madeOn: string; alreadyLogged: boolean; entryId: string | null } = await res.json()
        setEntryStates((prev) => ({
          ...prev,
          [key]: {
            status: data.alreadyLogged ? 'alreadyLogged' : 'success',
            makeAgainEntryId: !data.alreadyLogged ? (data.entryId ?? null) : null,
          },
        }))
        setTimeout(() => {
          setEntryStates((prev) => ({ ...prev, [key]: { ...prev[key]!, status: 'idle' } }))
        }, TOAST_DURATION_MS)
      } else {
        setEntryStates((prev) => ({ ...prev, [key]: { status: 'idle', makeAgainEntryId: null } }))
      }
    } catch {
      setEntryStates((prev) => ({ ...prev, [key]: { status: 'idle', makeAgainEntryId: null } }))
    }
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, i) => {
        const key = getKey(entry)
        const state = entryStates[key] ?? { status: 'idle', makeAgainEntryId: null }
        return (
          <div
            key={`${key}-${i}`}
            className="rounded-lg border border-stone-200 px-4 py-3 bg-white space-y-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-stone-500">{entry.dateLabel}</p>
                <p className="text-sm font-medium text-stone-900">{entry.recipeTitle}</p>
              </div>
              <div className="flex items-center gap-2">
                {entry.confirmed && (
                  <span className="text-xs text-sage-500 font-medium">✓ Confirmed</span>
                )}
                <button
                  onClick={() => handleLog(entry)}
                  disabled={state.status === 'loading'}
                  className="text-xs px-3 py-1.5 rounded-full border border-stone-200 text-stone-600 bg-white hover:bg-stone-50 disabled:opacity-50"
                >
                  {state.status === 'success' ? '✓ Logged!'
                    : state.status === 'alreadyLogged' ? 'Already logged'
                    : 'Log made'}
                </button>
              </div>
            </div>
            {state.makeAgainEntryId && (
              <MakeAgainPrompt
                entryId={state.makeAgainEntryId}
                recipeId={entry.recipeId}
                onDismiss={() =>
                  setEntryStates((prev) => ({ ...prev, [key]: { ...prev[key]!, makeAgainEntryId: null } }))
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
