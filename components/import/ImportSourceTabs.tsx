'use client'

import { useState, useRef } from 'react'
import type { ImportFormat } from '@/lib/import/detect-format'

interface Props {
  onUrlsSubmit: (urls: string[]) => void
  onFileSubmit: (file: File, format?: string) => void
}

const URL_REGEX = /^https?:\/\//i

function parseUrlLines(text: string): { valid: string[]; invalid: number } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const valid = lines.filter((l) => URL_REGEX.test(l))
  return { valid, invalid: lines.length - valid.length }
}

const FORMAT_OPTIONS: { value: ImportFormat; label: string }[] = [
  { value: 'csv',          label: 'Generic CSV' },
  { value: 'plan_to_eat',  label: 'Plan to Eat' },
  { value: 'whisk',        label: 'Whisk / Samsung Food' },
  { value: 'notion_csv',   label: 'Notion CSV' },
]

export default function ImportSourceTabs({ onUrlsSubmit, onFileSubmit }: Props) {
  const [tab, setTab] = useState<'urls' | 'file'>('urls')
  const [urlText, setUrlText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null)
  const [selectedFormat, setSelectedFormat] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { valid, invalid } = parseUrlLines(urlText)

  function detectFormatFromFile(f: File): string | null {
    const name = f.name.toLowerCase()
    if (name.endsWith('.paprikarecipes')) return 'paprika'
    if (name.endsWith('.json')) return 'whisk'
    // For CSV, we can't detect sub-format client-side — server will do it
    if (name.endsWith('.csv')) return 'csv'
    return null
  }

  function handleFileChange(f: File | null) {
    if (!f) return
    setFile(f)
    const fmt = detectFormatFromFile(f)
    setDetectedFormat(fmt)
    setSelectedFormat(fmt ?? '')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) handleFileChange(dropped)
  }

  const formatLabel = (fmt: string | null): string => {
    if (!fmt) return ''
    return FORMAT_OPTIONS.find((o) => o.value === fmt)?.label ?? fmt
  }

  return (
    <div>
      {/* Tab selector */}
      <div className="flex border-b border-stone-200 mb-6">
        {(['urls', 'file'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-sage-500 text-sage-700'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t === 'urls' ? 'Paste URLs' : 'Upload File'}
          </button>
        ))}
      </div>

      {tab === 'urls' && (
        <div className="space-y-4">
          <p className="text-sm text-stone-500">
            Paste one recipe URL per line. We&apos;ll scrape and import each one.
          </p>
          <textarea
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            maxLength={10000}
            placeholder="https://www.example.com/recipe/chicken-pasta&#10;https://www.example.com/recipe/lemon-cake"
            rows={8}
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sage-400 resize-y"
          />
          <div className="flex items-center gap-4 text-sm">
            {valid.length > 0 && (
              <span className="text-sage-700 font-medium">
                {valid.length} valid URL{valid.length !== 1 ? 's' : ''} detected
              </span>
            )}
            {invalid > 0 && (
              <span className="text-amber-600">
                {invalid} line{invalid !== 1 ? 's' : ''} don&apos;t look like URLs — they&apos;ll be skipped
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={valid.length === 0}
            onClick={() => onUrlsSubmit(valid)}
            className="px-5 py-2 bg-sage-500 text-white rounded-lg text-sm font-medium hover:bg-sage-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Import
          </button>
        </div>
      )}

      {tab === 'file' && (
        <div className="space-y-4">
          <p className="text-sm text-stone-500">
            Supported formats: CSV, Paprika (.paprikarecipes), Whisk (.json), Plan to Eat, Notion CSV
          </p>

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="File upload zone"
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-sage-400 bg-sage-50' : 'border-stone-300 hover:border-sage-400 hover:bg-sage-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.paprikarecipes"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-stone-700">{file.name}</p>
                {detectedFormat && (
                  <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-sage-100 text-sage-700 font-medium">
                    {formatLabel(detectedFormat)}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-stone-400 text-sm">Drop file here or <span className="text-sage-600 underline">Browse</span></p>
            )}
          </div>

          {/* Format selector if not auto-detected */}
          {file && !detectedFormat && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Select format
              </label>
              <select
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
                className="border border-stone-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sage-400"
              >
                <option value="">— choose format —</option>
                {FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            disabled={!file || (!detectedFormat && !selectedFormat)}
            onClick={() => {
              if (file) onFileSubmit(file, detectedFormat ?? selectedFormat ?? undefined)
            }}
            className="px-5 py-2 bg-sage-500 text-white rounded-lg text-sm font-medium hover:bg-sage-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Import
          </button>
        </div>
      )}
    </div>
  )
}
