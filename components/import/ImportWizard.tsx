'use client'

import { useState, useCallback } from 'react'
import type { ImportResult } from '@/types'
import type { ImportFormat } from '@/lib/import/detect-format'
import ImportSourceTabs from './ImportSourceTabs'
import ImportProgress from './ImportProgress'
import NotionMappingEditor from './NotionMappingEditor'
import ReviewTable from './ReviewTable'
import ImportSummary from './ImportSummary'

type WizardStep = 'source' | 'progress' | 'notion' | 'review' | 'done'

interface WizardState {
  step:           WizardStep
  importMethod:   'urls' | 'file' | null
  jobId:          string | null
  results:        ImportResult[]
  format:         ImportFormat | null
  notionHeaders:  string[]
  notionMapping:  Record<string, string> | null
  notionRawCsv:   string | null
  savedRecipes:   { id: string; title: string; partial: boolean }[]
  summary: {
    imported:  number
    skipped:   number
    replaced:  number
    failed:    { title: string; error: string }[]
  } | null
}

const INITIAL_STATE: WizardState = {
  step:           'source',
  importMethod:   null,
  jobId:          null,
  results:        [],
  format:         null,
  notionHeaders:  [],
  notionMapping:  null,
  notionRawCsv:   null,
  savedRecipes:   [],
  summary:        null,
}

function resultToSavePayload(r: ImportResult) {
  return {
    data:             r.recipe!,
    duplicate_action: r.duplicate_action,
    existing_id:      r.duplicate_action === 'replace' ? r.duplicate?.recipe_id : undefined,
  }
}

export default function ImportWizard() {
  const [state, setState] = useState<WizardState>(INITIAL_STATE)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── source → progress (URL import) ──────────────────────────────────────────

  async function handleUrlsSubmit(urls: string[]) {
    setError(null)
    try {
      const res = await fetch('/api/import/urls', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ urls }),
      })
      const data = await res.json() as { job_id?: string; total?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to start import')

      setState((prev) => ({
        ...prev,
        step:         'progress',
        importMethod: 'urls',
        jobId:        data.job_id ?? null,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start import')
    }
  }

  // ── source → review / notion (file import) ───────────────────────────────────

  async function handleFileSubmit(file: File, format?: string) {
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (format) form.append('format', format)

      const res = await fetch('/api/import/file', { method: 'POST', body: form })
      const data = await res.json() as {
        format:          string
        total:           number
        results:         ImportResult[]
        notion_mapping?: Record<string, string>
        error?:          string
      }
      if (!res.ok) throw new Error(data.error ?? 'File import failed')

      if (data.notion_mapping) {
        // Read CSV text for re-parse after mapping confirmation
        const text = await file.text()
        const firstLine = text.split('\n')[0] ?? ''
        const headers = firstLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''))

        setState((prev) => ({
          ...prev,
          step:          'notion',
          importMethod:  'file',
          format:        data.format as ImportFormat,
          notionHeaders: headers,
          notionMapping: data.notion_mapping!,
          notionRawCsv:  text,
        }))
        return
      }

      const results: ImportResult[] = (data.results ?? []).map((r, _i) => ({
        ...r,
        id:           r.id ?? crypto.randomUUID(),
        source_label: r.source_label ?? (file.name ?? 'File'),
        duplicate_action: r.duplicate ? 'keep_both' : undefined,
      }))

      setState((prev) => ({
        ...prev,
        step:         'review',
        importMethod: 'file',
        format:       data.format as ImportFormat,
        results,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File import failed')
    }
  }

  // ── progress → review ────────────────────────────────────────────────────────

  const handleProgressComplete = useCallback((results: ImportResult[]) => {
    setState((prev) => ({ ...prev, step: 'review', results }))
  }, [])

  // ── notion → review ──────────────────────────────────────────────────────────

  async function handleNotionConfirm(mapping: Record<string, string>) {
    setError(null)
    const rawCsv = state.notionRawCsv
    if (!rawCsv) return

    try {
      const res = await fetch('/api/import/confirm-notion-mapping', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ file_content: rawCsv, mapping }),
      })
      const data = await res.json() as {
        results: ImportResult[]
        error?:  string
      }
      if (!res.ok) throw new Error(data.error ?? 'Notion mapping failed')

      const results: ImportResult[] = (data.results ?? []).map((r) => ({
        ...r,
        id:           r.id ?? crypto.randomUUID(),
        source_label: r.source_label ?? 'Notion',
        duplicate_action: r.duplicate ? 'keep_both' : undefined,
      }))

      setState((prev) => ({ ...prev, step: 'review', results }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply Notion mapping')
    }
  }

  // ── review → done ────────────────────────────────────────────────────────────

  async function handleSave(selected: ImportResult[]) {
    setIsSaving(true)
    setError(null)

    const recipesToSave = selected.filter((r) => r.recipe && r.status !== 'failed')

    try {
      const res = await fetch('/api/import/save', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ recipes: recipesToSave.map(resultToSavePayload) }),
      })
      const data = await res.json() as {
        imported:  number
        skipped:   number
        replaced:  number
        failed:    { title: string; error: string }[]
        error?:    string
      }
      if (!res.ok) throw new Error(data.error ?? 'Save failed')

      // Identify partial recipes to show edit links
      const partialIds = selected
        .filter((r) => r.status === 'partial' && r.recipe)
        .map((r) => ({ id: r.id, title: r.recipe!.title, partial: true }))

      setState((prev) => ({
        ...prev,
        step:         'done',
        summary:      data,
        savedRecipes: partialIds,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  function handleResultsChange(updated: ImportResult[]) {
    setState((prev) => ({ ...prev, results: updated }))
  }

  function handleImportMore() {
    setState(INITIAL_STATE)
    setError(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      {state.step !== 'done' && (
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-stone-800">Import Recipes</h1>
          <p className="text-stone-500 mt-1 text-sm">
            Add your existing recipe library to Thymeline.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {state.step === 'source' && (
        <ImportSourceTabs
          onUrlsSubmit={handleUrlsSubmit}
          onFileSubmit={handleFileSubmit}
        />
      )}

      {state.step === 'progress' && state.jobId && (
        <ImportProgress
          jobId={state.jobId}
          onComplete={handleProgressComplete}
        />
      )}

      {state.step === 'notion' && state.notionMapping && (
        <NotionMappingEditor
          headers={state.notionHeaders}
          mapping={state.notionMapping}
          onConfirm={handleNotionConfirm}
          onCancel={() => setState((prev) => ({ ...prev, step: 'source' }))}
        />
      )}

      {state.step === 'review' && (
        <ReviewTable
          results={state.results}
          onChange={handleResultsChange}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}

      {state.step === 'done' && state.summary && (
        <ImportSummary
          summary={state.summary}
          partialRecipes={state.savedRecipes.filter((r) => r.partial)}
          onImportMore={handleImportMore}
        />
      )}
    </div>
  )
}
