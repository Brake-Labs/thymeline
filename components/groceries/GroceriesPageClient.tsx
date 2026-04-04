'use client'

import { useState, useEffect, useCallback } from 'react'
import { GroceryList } from '@/types'
import GroceryListView from './GroceryListView'
import { getAccessToken } from '@/lib/supabase/browser'
import { getMostRecentSunday, getMostRecentWeekStart, addDays, formatShortDate as formatDate } from '@/lib/date-utils'
import DateInput from '@/components/ui/DateInput'

interface Props {
  initialDateFrom?: string
  initialDateTo?:   string
}

export default function GroceriesPageClient({ initialDateFrom, initialDateTo }: Props) {
  const [weekStartDay, setWeekStartDay] = useState(0)
  const thisWeekStart = getMostRecentWeekStart(weekStartDay)
  const nextWeekStart = addDays(thisWeekStart, 7)

  const [dateFrom, setDateFrom] = useState(initialDateFrom ?? getMostRecentSunday())
  const [dateTo,   setDateTo  ] = useState(initialDateTo   ?? addDays(getMostRecentSunday(), 6))
  const [list,         setList        ] = useState<GroceryList | null | undefined>(undefined)  // undefined = loading
  const [recipeCount,  setRecipeCount ] = useState<number | null>(null)
  const [generating,   setGenerating  ] = useState(false)
  const [genError,     setGenError    ] = useState<string | null>(null)

  const presets = [
    { label: 'This week',    from: thisWeekStart,            to: addDays(thisWeekStart, 6)  },
    { label: 'Next week',    from: nextWeekStart,            to: addDays(nextWeekStart, 6)  },
    { label: 'Next 2 weeks', from: thisWeekStart,            to: addDays(thisWeekStart, 13) },
  ]

  // Load week_start_day preference once on mount
  useEffect(() => {
    async function loadPref() {
      try {
        const token = await getAccessToken()
        const res = await fetch('/api/preferences', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const prefs = await res.json()
          const pref: number = prefs.week_start_day ?? 0
          if (pref !== 0) {
            setWeekStartDay(pref)
            if (!initialDateFrom) {
              const start = getMostRecentWeekStart(pref)
              setDateFrom(start)
              setDateTo(addDays(start, 6))
            }
          }
        }
      } catch { /* silently fail — default to Sunday */ }
    }
    void loadPref()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchList = useCallback(async (from: string, _to: string) => {
    setList(undefined)  // loading
    try {
      const token = await getAccessToken()
      const res = await fetch(`/api/groceries?date_from=${from}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { setList(null); return }
      const json = await res.json()
      setList(json.list ?? null)
    } catch {
      setList(null)
    }
  }, [])

  const fetchCount = useCallback(async (from: string, to: string) => {
    setRecipeCount(null)
    try {
      const token = await getAccessToken()
      const res = await fetch(`/api/groceries/count?date_from=${from}&date_to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const json = await res.json()
        setRecipeCount(json.recipe_count ?? 0)
      }
    } catch {
      setRecipeCount(0)
    }
  }, [])

  useEffect(() => {
    fetchList(dateFrom, dateTo)
    fetchCount(dateFrom, dateTo)
  }, [dateFrom, dateTo, fetchList, fetchCount])

  async function handleGenerate() {
    setGenerating(true)
    setGenError(null)
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/groceries/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      })
      const json = await res.json()
      if (res.ok) {
        setList(json.list)
      } else {
        setGenError(json.error ?? 'Failed to generate grocery list')
      }
    } catch {
      setGenError('Failed to generate grocery list')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* Date range picker */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-stone-600">From</label>
            <DateInput value={dateFrom} onChange={setDateFrom} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-stone-600">To</label>
            <DateInput value={dateTo} min={dateFrom} onChange={setDateTo} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => { setDateFrom(p.from); setDateTo(p.to) }}
              className={[
                'text-xs px-3 py-1 rounded-full border transition-colors',
                dateFrom === p.from && dateTo === p.to
                  ? 'bg-sage-500 border-sage-500 text-white'
                  : 'border-stone-300 text-stone-600 hover:bg-stone-50',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {list === undefined ? (
        <div className="py-12 text-center text-stone-400 text-sm">Loading…</div>
      ) : list !== null ? (
        <GroceryListView
          initialList={list}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onListUpdated={setList}
        />
      ) : (
        <div className="text-center space-y-4 py-8">
          <h2 className="font-display text-lg font-semibold text-stone-800">
            No grocery list for {formatDate(dateFrom)}–{formatDate(dateTo)}
          </h2>
          {recipeCount === null ? (
            <p className="text-stone-400 text-sm">Checking meal plan…</p>
          ) : recipeCount === 0 ? (
            <p className="text-stone-500 text-sm">No recipes planned for this range.</p>
          ) : (
            <p className="text-stone-600 text-sm">
              {recipeCount} recipe{recipeCount !== 1 ? 's' : ''} planned — generate a list to get started.
            </p>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || recipeCount === 0}
            className="font-display px-6 py-3 bg-sage-500 text-white text-sm font-semibold rounded-lg hover:bg-sage-600 disabled:opacity-60 transition-colors"
          >
            {generating ? 'Generating…' : 'Generate grocery list'}
          </button>
          {genError && <p className="text-sm text-red-600">{genError}</p>}
        </div>
      )}
    </div>
  )
}
