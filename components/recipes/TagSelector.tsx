'use client'

import { useEffect, useState, useRef } from 'react'
import { STYLE_DIETARY_TAGS, PROTEIN_TAGS, FIRST_CLASS_TAGS } from '@/lib/tags'
import { getAccessToken } from '@/lib/supabase/browser'

interface TagSelectorProps {
  selected:     string[]
  suggested?:   string[]
  pendingNew?:  string[]
  onChange:     (tags: string[]) => void
  onCreateTag?: (tag: string) => void
}

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function TagSelector({
  selected,
  suggested = [],
  pendingNew = [],
  onChange,
  onCreateTag,
}: TagSelectorProps) {
  const [customTags, setCustomTags] = useState<string[]>([])
  const [interactedSuggested, setInteractedSuggested] = useState<Set<string>>(new Set())
  const [localPendingNew, setLocalPendingNew] = useState<string[]>(pendingNew)
  const [showInput, setShowInput] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [dedupHint, setDedupHint] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync localPendingNew when prop changes (use join as stable primitive to avoid new [] ref each render)
  const pendingNewKey = pendingNew.join(',')
  useEffect(() => {
    setLocalPendingNew(pendingNew)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNewKey])

  useEffect(() => {
    async function loadCustomTags() {
      try {
        const token = await getAccessToken()
        const res = await fetch('/api/tags', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data: { firstClass: string[]; custom: string[] } = await res.json()
          setCustomTags(data.custom ?? [])
        }
      } catch { /* non-fatal */ }
    }
    loadCustomTags()
  }, [])

  useEffect(() => {
    if (showInput) inputRef.current?.focus()
  }, [showInput])

  const allKnown = [...FIRST_CLASS_TAGS, ...customTags]

  function toggleTag(tag: string) {
    if (suggested.includes(tag)) {
      setInteractedSuggested((prev) => { const next = new Set(prev); next.add(tag); return next })
    }
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag))
    } else {
      onChange([...selected, tag])
    }
  }

  function hasSuggestionSparkle(tag: string): boolean {
    return suggested.includes(tag) && !interactedSuggested.has(tag)
  }

  function chipClass(tag: string): string {
    if (selected.includes(tag)) return 'bg-stone-800 text-white border-stone-800'
    return 'border border-stone-300 text-stone-600 bg-white hover:bg-stone-50'
  }

  async function handleConfirmPendingNew(name: string) {
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        const created: { name: string } = await res.json()
        setCustomTags((prev) => [...prev, created.name])
        onChange([...selected, created.name])
        setLocalPendingNew((prev) => prev.filter((t) => t !== name))
        onCreateTag?.(created.name)
      }
    } catch { /* non-fatal */ }
  }

  function handleDismissPendingNew(name: string) {
    setLocalPendingNew((prev) => prev.filter((t) => t !== name))
  }

  async function handleCreateFromInput() {
    const trimmed = inputValue.trim()
    if (!trimmed) { setShowInput(false); return }

    const lc = trimmed.toLowerCase()
    const existing = allKnown.find((t) => t.toLowerCase() === lc)
    if (existing) {
      if (!selected.includes(existing)) onChange([...selected, existing])
      setDedupHint(`'${existing}' already exists — selected it for you.`)
      setInputValue('')
      setShowInput(false)
      setTimeout(() => setDedupHint(null), 3000)
      return
    }

    const normalized = toTitleCase(trimmed)
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: normalized }),
      })
      if (res.ok) {
        const created: { name: string } = await res.json()
        setCustomTags((prev) => [...prev, created.name])
        onChange([...selected, created.name])
        onCreateTag?.(created.name)
      }
    } catch { /* non-fatal */ }

    setInputValue('')
    setShowInput(false)
  }

  function renderChip(tag: string) {
    const sparkle = hasSuggestionSparkle(tag)
    return (
      <button
        key={tag}
        type="button"
        onClick={() => toggleTag(tag)}
        className={`relative inline-flex items-center rounded-full text-xs px-2.5 py-1 border transition-colors ${chipClass(tag)}`}
      >
        {tag}
        {sparkle && (
          <span aria-hidden="true" className="absolute -top-1 -right-1 text-[8px] leading-none pointer-events-none">✦</span>
        )}
      </button>
    )
  }

  const hasPendingOrCustom = customTags.length > 0 || localPendingNew.length > 0

  return (
    <div className="space-y-3">
      {/* Style / Dietary section */}
      <div>
        <p className="text-xs text-stone-400 mb-1.5">Style / Dietary</p>
        <div className="flex flex-wrap gap-1.5">
          {(STYLE_DIETARY_TAGS as readonly string[]).map(renderChip)}
        </div>
      </div>

      {/* Protein section */}
      <div>
        <p className="text-xs text-stone-400 mb-1.5">Protein</p>
        <div className="flex flex-wrap gap-1.5">
          {(PROTEIN_TAGS as readonly string[]).map(renderChip)}
        </div>
      </div>

      {/* Custom + pending-new section */}
      {hasPendingOrCustom && (
        <div>
          <p className="text-xs text-stone-400 mb-1.5">Custom</p>
          <div className="flex flex-wrap gap-1.5">
            {customTags.map(renderChip)}

            {localPendingNew.map((name) => (
              <span
                key={name}
                className="relative inline-flex items-center rounded-full text-xs border border-dashed border-amber-400 bg-amber-50 text-amber-800"
              >
                <button
                  type="button"
                  onClick={() => handleConfirmPendingNew(name)}
                  className="pl-2.5 pr-1 py-1 leading-none"
                  aria-label={`Confirm tag ${name}`}
                >
                  {name}
                </button>
                <span aria-hidden="true" className="absolute -top-1 -right-1 text-[8px] leading-none pointer-events-none">✦</span>
                <button
                  type="button"
                  onClick={() => handleDismissPendingNew(name)}
                  className="pr-2 py-1 text-amber-600 hover:text-amber-900 focus:outline-none"
                  aria-label={`Dismiss ${name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* + chip / inline input */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {!showInput ? (
          <button
            type="button"
            onClick={() => { setShowInput(true); setDedupHint(null) }}
            className="inline-flex items-center rounded-full text-xs px-2.5 py-1 border border-stone-300 text-stone-600 bg-white hover:bg-stone-50 transition-colors"
            aria-label="Add custom tag"
          >
            +
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleCreateFromInput() }
                if (e.key === 'Escape') { setShowInput(false); setInputValue('') }
              }}
              onBlur={() => { setShowInput(false); setInputValue('') }}
              placeholder="Tag name"
              className="border border-stone-300 rounded-full px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 w-28"
            />
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleCreateFromInput() }}
              className="text-xs text-stone-600 hover:text-stone-900"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {dedupHint && (
        <p className="text-xs text-stone-500">{dedupHint}</p>
      )}
    </div>
  )
}
