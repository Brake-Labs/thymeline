'use client'

import { useEffect, useRef, useState } from 'react'
import type { ImportResult } from '@/types'
import type { JobResult } from '@/lib/import-jobs'
import { getAccessToken } from '@/lib/supabase/browser'

interface Props {
  jobId:      string
  onComplete: (results: ImportResult[]) => void
}

interface JobSnapshot {
  total:     number
  completed: number
  results:   JobResult[]
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
  const [job, setJob] = useState<JobSnapshot>({ total: 0, completed: 0, results: [] })
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  // Stable ref to onComplete so the interval callback doesn't capture a stale closure
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    async function poll() {
      try {
        const token = await getAccessToken()
        const res = await fetch(`/api/import/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return

        const data = await res.json() as JobSnapshot

        // Replace state with a new object so React detects the change
        setJob({
          total:     data.total     ?? 0,
          completed: data.completed ?? 0,
          results:   data.results   ?? [],
        })

        if ((data.completed ?? 0) >= data.total && data.total > 0) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          onCompleteRef.current(data.results.map(jobResultToImportResult))
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
  }, [jobId])

  function handleCancel() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    onCompleteRef.current(job.results.map(jobResultToImportResult))
  }

  const { completed, total, results } = job
  const pct      = total > 0 ? Math.round((completed / total) * 100) : 0
  const isDone   = total > 0 && completed >= total

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-sm text-stone-600 mb-1">
          <span>
            {total === 0
              ? 'Waiting for results…'
              : isDone
                ? 'Import complete'
                : `Importing ${completed} of ${total} recipes…`}
          </span>
          <span>{pct}%</span>
        </div>
        <div className="w-full bg-stone-200 rounded-full h-2">
          <div
            className={`bg-sage-500 h-2 rounded-full transition-all duration-500${isDone ? '' : ' animate-pulse'}`}
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
        {results.length === 0 && total > 0 && (
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
