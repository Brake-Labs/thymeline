'use client'

import { useState } from 'react'
import type { PantryItem } from '@/types'
import PantryItemRow from './PantryItemRow'

interface PantrySectionProps {
  section:  string
  items:    PantryItem[]
  onEdit:   (item: PantryItem) => void
  onDelete: (id: string) => void
}

export default function PantrySection({ section, items, onEdit, onDelete }: PantrySectionProps) {
  const [collapsed, setCollapsed] = useState(items.length > 10)

  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between py-1 mb-1"
        aria-expanded={!collapsed}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
          {section} <span className="font-normal normal-case">({items.length})</span>
        </h3>
        <span className="text-xs text-stone-300">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className="divide-y divide-stone-100">
          {items.map((item) => (
            <PantryItemRow
              key={item.id}
              item={item}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  )
}
