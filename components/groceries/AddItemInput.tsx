'use client'

import { useRef, useState } from 'react'

interface AddItemInputProps {
  onAdd: (name: string) => void
}

export default function AddItemInput({ onAdd }: AddItemInputProps) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function submit() {
    const trimmed = value.trim()
    if (trimmed) {
      onAdd(trimmed)
      setValue('')
    }
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }}
        className="mt-3 text-sm text-sage-500 hover:text-sage-700 font-medium"
        aria-label="Add item"
      >
        + Add item
      </button>
    )
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          if (e.key === 'Escape') { setOpen(false); setValue('') }
        }}
        onBlur={() => { submit() }}
        placeholder="Item name…"
        className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-500"
      />
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); submit() }}
        className="px-3 py-2 text-sm bg-sage-500 text-white rounded-lg hover:bg-sage-600"
      >
        Add
      </button>
    </div>
  )
}
