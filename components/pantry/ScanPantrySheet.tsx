'use client'

import { useState, useRef } from 'react'
import type { PantryItem } from '@/types'
import { getAccessToken } from '@/lib/supabase/browser'

interface DetectedItem {
  name:     string
  quantity: string | null
  section:  string | null
}

interface ScanPantrySheetProps {
  onImport: (items: PantryItem[]) => void
  onClose:  () => void
}

type Step = 'upload' | 'scanning' | 'review' | 'importing'

export default function ScanPantrySheet({ onImport, onClose }: ScanPantrySheetProps) {
  const [step, setStep] = useState<Step>('upload')
  const [detected, setDetected] = useState<DetectedItem[]>([])
  const [checked, setChecked] = useState<boolean[]>([])
  const [editedNames, setEditedNames] = useState<string[]>([])
  const [editedQtys, setEditedQtys] = useState<(string | null)[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setStep('scanning')
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const token = await getAccessToken()
      const res = await fetch('/api/pantry/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image: base64 }),
      })
      const json = await res.json()
      const items: DetectedItem[] = json.detected ?? []
      setDetected(items)
      setChecked(items.map(() => true))
      setEditedNames(items.map((i) => i.name))
      setEditedQtys(items.map((i) => i.quantity))
      setStep('review')
    } catch {
      setDetected([])
      setChecked([])
      setEditedNames([])
      setEditedQtys([])
      setStep('review')
    }
  }

  async function handleConfirm() {
    const toImport = detected
      .map((item, i) => ({
        name:     editedNames[i] ?? item.name,
        quantity: editedQtys[i] ?? null,
        section:  item.section,
      }))
      .filter((_, i) => checked[i])

    if (toImport.length === 0) {
      onClose()
      return
    }

    setStep('importing')
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/pantry/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items: toImport }),
      })
      if (res.ok) {
        // Fetch fresh pantry to get the newly imported items with IDs
        const pantryRes = await fetch('/api/pantry', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (pantryRes.ok) {
          const pantryJson = await pantryRes.json()
          onImport(pantryJson.items as PantryItem[])
        }
      }
    } finally {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-stone-100">
          <h2 className="font-display font-semibold text-stone-800">Scan Pantry</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {step === 'upload' && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-stone-500 text-center">
                Take a photo of your pantry or fridge and we&apos;ll detect the ingredients.
              </p>
              <label className="w-full flex flex-col items-center gap-3 border-2 border-dashed border-stone-200 rounded-xl py-8 px-4 cursor-pointer hover:border-sage-400 transition-colors">
                <span className="text-3xl">📷</span>
                <span className="text-sm font-medium text-stone-600">Take photo or choose file</span>
                <span className="text-xs text-stone-400">JPG, PNG, WEBP supported</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFile(file)
                  }}
                />
              </label>
            </div>
          )}

          {step === 'scanning' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-8 h-8 border-2 border-sage-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-stone-500">Scanning your pantry&hellip;</p>
            </div>
          )}

          {step === 'review' && (
            <div className="flex flex-col gap-3">
              {detected.length === 0 ? (
                <p className="text-sm text-stone-500 text-center py-4">
                  Nothing detected &mdash; try a clearer photo.
                </p>
              ) : (
                <>
                  <p className="text-xs text-stone-400">Uncheck items you don&apos;t want to import.</p>
                  {detected.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked[i] ?? true}
                        onChange={(e) => {
                          const next = [...checked]; next[i] = e.target.checked; setChecked(next)
                        }}
                        id={`scan-item-${i}`}
                        className="rounded border-stone-300 text-sage-500"
                      />
                      <input
                        type="text"
                        value={editedNames[i] ?? ''}
                        onChange={(e) => {
                          const next = [...editedNames]; next[i] = e.target.value; setEditedNames(next)
                        }}
                        aria-label={`Item name for ${item.name}`}
                        className="flex-1 border border-stone-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-sage-400"
                      />
                      <input
                        type="text"
                        value={editedQtys[i] ?? ''}
                        onChange={(e) => {
                          const next = [...editedQtys]; next[i] = e.target.value || null; setEditedQtys(next)
                        }}
                        placeholder="qty"
                        aria-label={`Quantity for ${item.name}`}
                        className="w-20 border border-stone-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-sage-400"
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-8 h-8 border-2 border-sage-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-stone-500">Adding to pantry&hellip;</p>
            </div>
          )}
        </div>

        {step === 'review' && (
          <div className="px-4 py-3 border-t border-stone-100">
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full py-2 rounded-xl bg-sage-500 text-white text-sm font-medium hover:bg-sage-600 transition-colors"
            >
              {detected.length === 0 ? 'Close' : `Add ${checked.filter(Boolean).length} item${checked.filter(Boolean).length !== 1 ? 's' : ''} to Pantry`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
