'use client'

import { useState } from 'react'
import TagRow from './TagRow'

interface FirstClassTag {
  name: string
  recipe_count: number
}

interface CustomTag {
  name: string
  section: string
  recipe_count: number
}

interface HiddenTag {
  name: string
}

interface TagLibrarySectionProps {
  firstClassTags: FirstClassTag[]
  customTags:     CustomTag[]
  hiddenTags:     HiddenTag[]
  getToken:       () => Promise<string> | string
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[4px] border border-stone-200 bg-stone-50 overflow-hidden">
      <div className="h-[3px] bg-sage-500" />
      <div className="px-5 py-5 space-y-4">
        {children}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display font-bold text-[10px] uppercase tracking-[0.12em] text-sage-500">
      {children}
    </h2>
  )
}

function SubSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide mt-3 mb-1">
      {children}
    </p>
  )
}

export default function TagLibrarySection({
  firstClassTags: initialFirstClass,
  customTags: initialCustom,
  hiddenTags: initialHidden,
  getToken,
}: TagLibrarySectionProps) {
  const [firstClassTags, setFirstClassTags] = useState<FirstClassTag[]>(initialFirstClass)
  const [customTags, setCustomTags]         = useState<CustomTag[]>(initialCustom)
  const [hiddenTags, setHiddenTags]         = useState<HiddenTag[]>(initialHidden)

  const [addInput, setAddInput]   = useState('')
  const [addError, setAddError]   = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)

  // deleteConfirm: tagName → recipe_count (null = loading)
  const [deleteConfirm, setDeleteConfirm] = useState<{ name: string; count: number | null } | null>(null)
  const [deleteError, setDeleteError]     = useState<string | null>(null)

  // ── Add ──────────────────────────────────────────────────────────────────────

  async function handleAdd() {
    const trimmed = addInput.trim()
    if (!trimmed) return

    // Client-side duplicate check (case-insensitive, across all visible tags)
    const allNames = [
      ...firstClassTags.map((t) => t.name),
      ...customTags.map((t) => t.name),
      ...hiddenTags.map((t) => t.name),
    ]
    if (allNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setAddError('A tag with that name already exists.')
      return
    }

    setAddLoading(true)
    setAddError(null)
    try {
      const token = await getToken()
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed, section: 'style' }),
      })
      if (res.ok || res.status === 201) {
        const created: { name: string; section: string } = await res.json()
        setCustomTags((prev) => [...prev, { name: created.name, section: created.section, recipe_count: 0 }])
        setAddInput('')
      } else {
        const body: { error?: string } = await res.json()
        setAddError(body.error ?? 'Could not add tag. Please try again.')
      }
    } catch {
      setAddError('Could not add tag. Please try again.')
    } finally {
      setAddLoading(false)
    }
  }

  // ── Hide (first-class → hidden) ───────────────────────────────────────────────

  async function handleHide(tagName: string) {
    // Optimistic update
    const tag = firstClassTags.find((t) => t.name === tagName)
    setFirstClassTags((prev) => prev.filter((t) => t.name !== tagName))
    setHiddenTags((prev) => [...prev, { name: tagName }])

    try {
      const token = await getToken()
      const res = await fetch(`/api/tags/${encodeURIComponent(tagName)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok && res.status !== 204) {
        // Roll back
        setFirstClassTags((prev) => (tag ? [...prev, tag] : prev))
        setHiddenTags((prev) => prev.filter((t) => t.name !== tagName))
      }
    } catch {
      if (tag) setFirstClassTags((prev) => [...prev, tag])
      setHiddenTags((prev) => prev.filter((t) => t.name !== tagName))
    }
  }

  // ── Restore (hidden → first-class) ───────────────────────────────────────────

  async function handleRestore(tagName: string) {
    // Optimistic update
    setHiddenTags((prev) => prev.filter((t) => t.name !== tagName))
    setFirstClassTags((prev) => [...prev, { name: tagName, recipe_count: 0 }])

    try {
      const token = await getToken()
      // Fetch current hidden_tags from preferences, then remove this one
      const prefsRes = await fetch('/api/preferences', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const prefs: { hidden_tags?: string[] } = await prefsRes.json()
      const updated = (prefs.hidden_tags ?? []).filter(
        (t) => t.toLowerCase() !== tagName.toLowerCase()
      )
      const patchRes = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hidden_tags: updated }),
      })
      if (!patchRes.ok) {
        // Roll back
        setHiddenTags((prev) => [...prev, { name: tagName }])
        setFirstClassTags((prev) => prev.filter((t) => t.name !== tagName))
      }
    } catch {
      setHiddenTags((prev) => [...prev, { name: tagName }])
      setFirstClassTags((prev) => prev.filter((t) => t.name !== tagName))
    }
  }

  // ── Rename ────────────────────────────────────────────────────────────────────

  async function handleRename(oldName: string, newName: string): Promise<void> {
    const token = await getToken()
    const res = await fetch(`/api/tags/${encodeURIComponent(oldName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newName }),
    })
    if (!res.ok) {
      const body: { error?: string } = await res.json()
      throw new Error(body.error ?? 'Could not rename tag. Please try again.')
    }
    const updated: { name: string; section: string } = await res.json()
    setCustomTags((prev) =>
      prev.map((t) => t.name === oldName ? { ...t, name: updated.name } : t)
    )
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDeleteClick(tagName: string) {
    setDeleteConfirm({ name: tagName, count: null })
    setDeleteError(null)
    try {
      const token = await getToken()
      const res = await fetch(`/api/tags/${encodeURIComponent(tagName)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data: { recipe_count: number } = await res.json()
        setDeleteConfirm({ name: tagName, count: data.recipe_count })
      } else {
        setDeleteConfirm(null)
        setDeleteError('Could not check tag usage. Please try again.')
      }
    } catch {
      setDeleteConfirm(null)
      setDeleteError('Could not check tag usage. Please try again.')
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirm) return
    const { name: tagName } = deleteConfirm
    try {
      const token = await getToken()
      const res = await fetch(`/api/tags/${encodeURIComponent(tagName)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok || res.status === 204) {
        setCustomTags((prev) => prev.filter((t) => t.name !== tagName))
        setDeleteConfirm(null)
      } else {
        const body: { error?: string } = await res.json()
        setDeleteError(body.error ?? 'Delete failed. Please try again.')
        setDeleteConfirm(null)
      }
    } catch {
      setDeleteError('Delete failed. Please try again.')
      setDeleteConfirm(null)
    }
  }

  return (
    <SectionCard>
      <SectionTitle>Tag library</SectionTitle>

      {/* Add tag */}
      <div className="flex gap-2">
        <input
          type="text"
          value={addInput}
          onChange={(e) => { setAddInput(e.target.value); setAddError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd() }}
          placeholder="Add a tag…"
          disabled={addLoading}
          className="flex-1 border border-stone-300 rounded-md px-3 py-1.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-sage-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={addLoading || !addInput.trim()}
          className="px-4 py-1.5 bg-sage-500 text-white text-sm font-medium rounded-md hover:bg-sage-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {addLoading ? 'Adding…' : 'Add'}
        </button>
      </div>
      {addError && <p className="text-xs text-red-500">{addError}</p>}

      {/* Built-in tags */}
      {firstClassTags.length > 0 && (
        <div>
          <SubSectionLabel>Built-in tags</SubSectionLabel>
          <div className="divide-y divide-stone-100">
            {firstClassTags.map((tag) => (
              <TagRow
                key={tag.name}
                name={tag.name}
                recipeCount={tag.recipe_count}
                variant="firstClass"
                onHide={() => void handleHide(tag.name)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Your tags */}
      {customTags.length > 0 && (
        <div>
          <SubSectionLabel>Your tags</SubSectionLabel>
          {deleteError && <p className="text-xs text-red-500 mb-1">{deleteError}</p>}
          <div className="divide-y divide-stone-100">
            {customTags.map((tag) => (
              <TagRow
                key={tag.name}
                name={tag.name}
                recipeCount={tag.recipe_count}
                variant="custom"
                onRename={(newName) => handleRename(tag.name, newName)}
                onDelete={() => void handleDeleteClick(tag.name)}
                deleteConfirmCount={
                  deleteConfirm?.name === tag.name ? deleteConfirm.count : undefined
                }
                onDeleteConfirm={() => void handleDeleteConfirm()}
                onDeleteCancel={() => setDeleteConfirm(null)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Hidden tags */}
      {hiddenTags.length > 0 && (
        <div>
          <SubSectionLabel>Hidden tags</SubSectionLabel>
          <div className="divide-y divide-stone-100">
            {hiddenTags.map((tag) => (
              <TagRow
                key={tag.name}
                name={tag.name}
                variant="hidden"
                onRestore={() => void handleRestore(tag.name)}
              />
            ))}
          </div>
        </div>
      )}

      {firstClassTags.length === 0 && customTags.length === 0 && hiddenTags.length === 0 && (
        <p className="text-sm text-stone-400">No tags yet. Add your first tag above.</p>
      )}
    </SectionCard>
  )
}
