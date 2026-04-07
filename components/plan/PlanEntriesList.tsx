'use client'

import { useState } from 'react'
import MakeAgainPrompt from '@/components/recipes/MakeAgainPrompt'
import { TOAST_DURATION_MS } from '@/lib/constants'

interface PlanEntry {
  planned_date:  string
  recipe_id:     string
  recipe_title:  string
  confirmed:     boolean
  dateLabel:     string
}

interface Props {
  entries: PlanEntry[]
}

interface EntryState {
  status: 'idle' | 'loading' | 'success' | 'already_logged'
  makeAgainEntryId: string | null
}

export default function PlanEntriesList({ entries }: Props) {
  const [entryStates, setEntryStates] = useState<Record<string, EntryState>>(() =>
    Object.fromEntries(entries.map((e) => [`${e.planned_date}-${e.recipe_id}`, { status: 'idle', makeAgainEntryId: null }]))
  )

  function getKey(entry: PlanEntry) {
    return `${entry.planned_date}-${entry.recipe_id}`
  }

  async function handleLog(entry: PlanEntry) {
    const key = getKey(entry)
    setEntryStates((prev) => ({ ...prev, [key]: { ...prev[key]!, status: 'loading', makeAgainEntryId: null } }))
    try {
      const res = await fetch(`/api/recipes/${entry.recipe_id}/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ made_on: entry.planned_date }),
      })
      if (res.ok) {
        const data: { made_on: string; already_logged: boolean; entry_id: string | null } = await res.json()
        setEntryStates((prev) => ({
          ...prev,
          [key]: {
            status: data.already_logged ? 'already_logged' : 'success',
            makeAgainEntryId: !data.already_logged ? (data.entry_id ?? null) : null,
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
                <p className="text-sm font-medium text-stone-900">{entry.recipe_title}</p>
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
                    : state.status === 'already_logged' ? 'Already logged'
                    : 'Log made'}
                </button>
              </div>
            </div>
            {state.makeAgainEntryId && (
              <MakeAgainPrompt
                entryId={state.makeAgainEntryId}
                recipeId={entry.recipe_id}
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
