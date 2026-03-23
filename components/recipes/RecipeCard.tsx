'use client'

import { useRef } from 'react'
import Link from 'next/link'
import type { RecipeListItem } from '@/types'
import { CATEGORY_LABELS } from '@/lib/category-labels'
import { formatMinutes } from '@/lib/format-time'

interface RecipeCardProps {
  recipe: RecipeListItem
  selected: boolean
  onSelect: (id: string, selected: boolean) => void
  selectionMode: boolean
  currentUserId: string | undefined
}

export default function RecipeCard({
  recipe,
  selected,
  onSelect,
  selectionMode,
  currentUserId,
}: RecipeCardProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)

  function handlePointerDown() {
    didLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true
      onSelect(recipe.id, true)
      if (navigator.vibrate) navigator.vibrate(10)
    }, 500)
  }

  function handlePointerUp() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  function handlePointerLeave() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  function handleCardClick(e: React.MouseEvent) {
    if (didLongPress.current) { e.preventDefault(); return }
    if (selectionMode) {
      e.preventDefault()
      onSelect(recipe.id, !selected)
    }
  }

  function handleCheckboxChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation()
    onSelect(recipe.id, e.target.checked)
  }

  const visibleTags = recipe.tags.slice(0, 3)
  const extraCount = recipe.tags.length - 3

  const isOwner = currentUserId && recipe.user_id === currentUserId

  return (
    <div
      className={`relative flex flex-col bg-[#FFFDF9] rounded border transition-all group ${
        selected
          ? 'border-2 border-sage-500'
          : 'border border-[#D4C9BA] hover:border-[#BFB2A0]'
      }`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      {/* Top accent bar */}
      <div className="h-[3px] bg-sage-500 rounded-t" />

      {/* Checkbox — visible on hover or when in selection mode */}
      <div className={`absolute top-2 right-2 z-10 ${selectionMode ? 'flex' : 'hidden group-hover:flex'}`}>
        {selected ? (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(recipe.id, false) }}
            className="w-5 h-5 rounded-full bg-sage-500 flex items-center justify-center text-white text-xs font-bold"
            aria-label="Deselect"
          >
            ✓
          </button>
        ) : (
          <input
            type="checkbox"
            checked={false}
            onChange={handleCheckboxChange}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 accent-sage-500 cursor-pointer"
            aria-label={`Select ${recipe.title}`}
          />
        )}
      </div>

      {/* Card body */}
      <Link
        href={`/recipes/${recipe.id}`}
        onClick={handleCardClick}
        className="flex-1 flex flex-col p-4 no-underline"
        draggable={false}
      >
        {/* Category */}
        <p className="text-[9px] font-bold uppercase tracking-widest text-sage-600 font-jakarta mb-1">
          {CATEGORY_LABELS[recipe.category]}
        </p>

        {/* Title */}
        <p className="text-sm font-bold text-[#1F2D26] font-jakarta leading-snug mb-1 line-clamp-2">
          {recipe.title}
        </p>

        {/* Time */}
        <p className="text-[11px] text-[#8C7D6B] font-manrope mb-2">
          {formatMinutes(recipe.total_time_minutes)}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mt-auto">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full bg-sage-50 text-sage-700 border border-sage-200"
            >
              {tag}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="text-[10px] text-[#8C7D6B]">+{extraCount}</span>
          )}
        </div>
      </Link>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-dashed border-[#D4C9BA]">
        <span className="text-[10px] text-[#8C7D6B]">
          {recipe.last_made ? `Made ${recipe.last_made}` : 'Never made'}
        </span>
        {isOwner && (
          <Link
            href={`/recipes/${recipe.id}/edit`}
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors"
            aria-label={`Edit ${recipe.title}`}
          >
            Edit
          </Link>
        )}
      </div>
    </div>
  )
}
