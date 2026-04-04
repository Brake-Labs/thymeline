'use client'

import { useState } from 'react'
import TagPill from './TagPill'

interface InlineTagEditorProps {
  recipeId: string
  currentTags: string[]
  availableTags?: string[]
  getToken: () => Promise<string> | string
  onUpdate: (updatedTags: string[]) => void
}

export default function InlineTagEditor({
  recipeId,
  currentTags,
  availableTags,
  getToken,
  onUpdate,
}: InlineTagEditorProps) {
  const [tags, setTags] = useState(currentTags)
  const [busy, setBusy] = useState(false)

  async function patchTags(next: string[]) {
    setBusy(true)
    try {
      const res = await fetch(`/api/recipes/${recipeId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getToken()}`,
        },
        body: JSON.stringify({ tags: next }),
      })
      if (res.ok) {
        setTags(next)
        onUpdate(next)
      }
    } finally {
      setBusy(false)
    }
  }

  const unselected = (availableTags ?? []).filter((t) => !tags.includes(t))

  return (
    <div className={`space-y-2 ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <TagPill
            key={tag}
            label={tag}
            onRemove={() => patchTags(tags.filter((t) => t !== tag))}
          />
        ))}
      </div>
      {unselected.length > 0 && (
        <select
          value=""
          onChange={(e) => { if (e.target.value) patchTags([...tags, e.target.value]) }}
          disabled={busy}
          className="border border-stone-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sage-500"
          aria-label="Add tag"
        >
          <option value="">Add tag…</option>
          {unselected.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}
    </div>
  )
}
