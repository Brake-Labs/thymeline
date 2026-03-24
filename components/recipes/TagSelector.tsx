'use client'

import { useEffect, useState, useRef } from 'react'
import { STYLE_TAGS, DIETARY_TAGS, SEASONAL_TAGS, CUISINE_TAGS, PROTEIN_TAGS, FIRST_CLASS_TAGS } from '@/lib/tags'
import { getAccessToken } from '@/lib/supabase/browser'

type Section = 'style' | 'dietary' | 'seasonal' | 'cuisine' | 'protein'

interface CustomTag {
  name: string
  section: Section
}

export interface PendingNewTag {
  name:    string
  section: Section
}

interface TagSelectorProps {
  selected:     string[]
  suggested?:   string[]
  pendingNew?:  PendingNewTag[]
  onChange:     (tags: string[]) => void
  onCreateTag?: (tag: string) => void
}

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

const SECTION_LABELS: Record<Section, string> = {
  style:    'Style',
  dietary:  'Dietary',
  seasonal: 'Seasonal',
  cuisine:  'Cuisine',
  protein:  'Protein',
}

export default function TagSelector({
  selected,
  suggested = [],
  pendingNew = [] as PendingNewTag[],
  onChange,
  onCreateTag,
}: TagSelectorProps) {
  const [customTags, setCustomTags] = useState<CustomTag[]>([])
  const [interactedSuggested, setInteractedSuggested] = useState<Set<string>>(new Set())
  const [localPendingNew, setLocalPendingNew] = useState<PendingNewTag[]>(pendingNew)
  const [showInput, setShowInput] = useState<Section | false>(false)
  const [inputValue, setInputValue] = useState('')
  const [dedupHint, setDedupHint] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync localPendingNew when prop changes
  const pendingNewKey = pendingNew.map((t) => t.name).join(',')
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
          const data: { firstClass: string[]; custom: CustomTag[] } = await res.json()
          setCustomTags(data.custom ?? [])
        }
      } catch { /* non-fatal */ }
    }
    loadCustomTags()
  }, [])

  useEffect(() => {
    if (showInput) inputRef.current?.focus()
  }, [showInput])

  const allKnownNames = [...FIRST_CLASS_TAGS, ...customTags.map((t) => t.name)]

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

  async function handleConfirmPendingNew(tag: PendingNewTag) {
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: tag.name, section: tag.section }),
      })
      if (res.ok) {
        const created: CustomTag = await res.json()
        setCustomTags((prev) => [...prev, { name: created.name, section: created.section ?? tag.section }])
        onChange([...selected, created.name])
        setLocalPendingNew((prev) => prev.filter((t) => t.name !== tag.name))
        onCreateTag?.(created.name)
      }
    } catch { /* non-fatal */ }
  }

  function handleDismissPendingNew(name: string) {
    setLocalPendingNew((prev) => prev.filter((t) => t.name !== name))
  }

  async function handleCreateFromInput() {
    const trimmed = inputValue.trim()
    if (!trimmed) { setShowInput(false); return }

    const lc = trimmed.toLowerCase()
    const existing = allKnownNames.find((t) => t.toLowerCase() === lc)
    if (existing) {
      if (!selected.includes(existing)) onChange([...selected, existing])
      setDedupHint(`'${existing}' already exists — selected it for you.`)
      setInputValue('')
      setShowInput(false)
      setTimeout(() => setDedupHint(null), 3000)
      return
    }

    const normalized = toTitleCase(trimmed)
    const section = showInput || 'cuisine'
    try {
      const token = await getAccessToken()
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: normalized, section }),
      })
      if (res.ok) {
        const created: CustomTag = await res.json()
        setCustomTags((prev) => [...prev, { name: created.name, section: created.section ?? section }])
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

  function renderAddChip(section: Section) {
    if (showInput === section) {
      return (
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
      )
    }
    return (
      <button
        type="button"
        onClick={() => { setShowInput(section); setDedupHint(null) }}
        className="inline-flex items-center rounded-full text-xs px-2.5 py-1 border border-stone-300 text-stone-600 bg-white hover:bg-stone-50 transition-colors"
        aria-label="Add custom tag"
      >
        +
      </button>
    )
  }

  const sections: { key: Section; firstClass: readonly string[] }[] = [
    { key: 'style',    firstClass: STYLE_TAGS },
    { key: 'dietary',  firstClass: DIETARY_TAGS },
    { key: 'seasonal', firstClass: SEASONAL_TAGS },
    { key: 'cuisine',  firstClass: CUISINE_TAGS },
    { key: 'protein',  firstClass: PROTEIN_TAGS },
  ]

  return (
    <div className="space-y-3">
      {sections.map(({ key, firstClass }) => {
        const sectionCustom = customTags.filter((t) => t.section === key)
        return (
          <div key={key}>
            <p className="text-xs text-stone-400 mb-1.5">{SECTION_LABELS[key]}</p>
            <div className="flex flex-wrap gap-1.5 items-center">
              {(firstClass as readonly string[]).map(renderChip)}
              {sectionCustom.map((t) => renderChip(t.name))}
              {renderAddChip(key)}
            </div>
          </div>
        )
      })}

      {/* Pending-new (AI-suggested, not yet created) */}
      {localPendingNew.length > 0 && (
        <div>
          <p className="text-xs text-stone-400 mb-1.5">Suggested new</p>
          <div className="flex flex-wrap gap-1.5">
            {localPendingNew.map((tag) => (
              <span
                key={tag.name}
                className="relative inline-flex items-center rounded-full text-xs border border-dashed border-amber-400 bg-amber-50 text-amber-800"
              >
                <button
                  type="button"
                  onClick={() => handleConfirmPendingNew(tag)}
                  className="pl-2.5 pr-1 py-1 leading-none"
                  aria-label={`Confirm tag ${tag.name}`}
                >
                  {tag.name}
                </button>
                <span aria-hidden="true" className="absolute -top-1 -right-1 text-[8px] leading-none pointer-events-none">✦</span>
                <button
                  type="button"
                  onClick={() => handleDismissPendingNew(tag.name)}
                  className="pr-2 py-1 text-amber-600 hover:text-amber-900 focus:outline-none"
                  aria-label={`Dismiss ${tag.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {dedupHint && (
        <p className="text-xs text-stone-500">{dedupHint}</p>
      )}
    </div>
  )
}
