'use client'

import { useEffect, useRef } from 'react'
import type { ImportResult } from '@/types'
import type { JobResult } from '@/app/api/import/urls/route'

interface Props {
  jobId:      string
  onComplete: (results: ImportResult[]) => void
}

function statusIcon(status: JobResult['status']): string {
  if (status === 'success')  return '✓'
  if (status === 'partial')  return '⚠'
  if (status === 'failed')   return '✗'
  if (status === 'pending')  return '…'
  return '🔁'
}

function statusColor(status: JobResult['status'], hasDuplicate: boolean): string {
  if (hasDuplicate) return 'text-amber-600'
  if (status === 'success')  return 'text-green-600'
  if (status === 'partial')  return 'text-yellow-600'
  if (status === 'failed')   return 'text-red-600'
  return 'text-stone-400'
}

function jobResultToImportResult(r: JobResult, index: number): ImportResult {
  const status: ImportResult['status'] =
    r.status === 'success' ? 'ready' :
    r.status === 'pending' ? 'pending' :
    r.status === 'partial' ? 'partial' : 'failed'

  return {
    id:           `job-result-${index}`,
    status,
    recipe:       r.recipe,
    error:        r.error,
    source_url:   r.url,
    source_label: (() => {
      try { return new URL(r.url).hostname.replace('www.', '') }
      catch { return r.url }
    })(),
    duplicate:         r.duplicate,
    duplicate_action:  r.duplicate ? 'keep_both' : undefined,
  }
}

export default function ImportProgress({ jobId, onComplete }: Props) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resultsRef = useRef<JobResult[]>([])
  const completedRef = useRef(0)
  const totalRef = useRef(0)

  // We use a forceUpdate pattern to re-render on poll
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(`/api/import/${jobId}`)
        if (!res.ok) return

        const data = await res.json() as {
          total:     number
          completed: number
          results:   JobResult[]
        }

        resultsRef.current   = data.results
        completedRef.current = data.completed
        totalRef.current     = data.total

        // Force re-render by updating a data attribute
        if (containerRef.current) {
          containerRef.current.dataset['completed'] = String(data.completed)
        }

        if (data.completed >= data.total) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          const importResults = data.results.map(jobResultToImportResult)
          onComplete(importResults)
        }
      } catch (err) {
        console.error('[ImportProgress] Poll error:', err)
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 2000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [jobId, onComplete])

  function handleCancel() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const importResults = resultsRef.current.map(jobResultToImportResult)
    onComplete(importResults)
  }

  const completed = completedRef.current
  const total     = totalRef.current
  const results   = resultsRef.current
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div ref={containerRef} className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-sm text-stone-600 mb-1">
          <span>Importing {completed} of {total} recipes…</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full bg-stone-200 rounded-full h-2">
          <div
            className="bg-sage-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto border border-stone-200 rounded-lg divide-y divide-stone-100">
        {results.map((r, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className={`font-mono font-bold ${statusColor(r.status, !!r.duplicate)}`}>
              {statusIcon(r.status)}
            </span>
            <span className="flex-1 truncate text-stone-700">
              {r.recipe?.title ?? r.url}
            </span>
            {r.error && (
              <span className="text-xs text-red-500 truncate max-w-[120px]">{r.error}</span>
            )}
            {r.duplicate && (
              <span className="text-xs text-amber-600">Duplicate</span>
            )}
          </div>
        ))}
        {results.length === 0 && (
          <div className="px-3 py-4 text-sm text-stone-400 text-center">
            Waiting for results…
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleCancel}
        className="text-sm text-stone-500 hover:text-stone-700 underline"
      >
        Cancel
      </button>
    </div>
  )
}
