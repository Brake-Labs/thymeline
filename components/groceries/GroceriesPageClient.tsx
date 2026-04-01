'use client'

import { useState, useEffect, useCallback } from 'react'
import { GroceryList } from '@/types'
import GroceryListView from './GroceryListView'
import { getAccessToken } from '@/lib/supabase/browser'
import { getMostRecentSunday, addDays, formatShortDate as formatDate } from '@/lib/date-utils'

export default function GroceriesPageClient() {
  const thisSunday = getMostRecentSunday()
  const nextSunday = addDays(thisSunday, 7)

  const [dateFrom, setDateFrom] = useState(thisSunday)
  const [dateTo,   setDateTo  ] = useState(addDays(thisSunday, 6))
  const [list,     setList    ] = useState<GroceryList | null | undefined>(undefined)  // undefined = loading
  const [generating, setGenerating] = useState(false)
  const [genError,   setGenError  ] = useState<string | null>(null)

  const presets = [
    { label: 'This week',   from: thisSunday,            to: addDays(thisSunday, 6)  },
    { label: 'Next week',   from: nextSunday,            to: addDays(nextSunday, 6)  },
    { label: 'Next 2 weeks', from: thisSunday,           to: addDays(thisSunday, 13) },
  ]

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

  useEffect(() => { fetchList(dateFrom, dateTo) }, [dateFrom, dateTo, fetchList])

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
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value) }}
              className="bg-[#FFFDF9] border border-stone-200 rounded-[4px] px-2 py-1.5 font-sans text-[13px] text-sage-900 accent-[#4A7C59] focus:outline-none focus:ring-2 focus:ring-sage-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-stone-600">To</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(e) => { setDateTo(e.target.value) }}
              className="bg-[#FFFDF9] border border-stone-200 rounded-[4px] px-2 py-1.5 font-sans text-[13px] text-sage-900 accent-[#4A7C59] focus:outline-none focus:ring-2 focus:ring-sage-500"
            />
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
          <p className="text-stone-600 text-sm">
            Generate a list from your meal plans for this date range.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
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
