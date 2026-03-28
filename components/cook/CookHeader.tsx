'use client'

import Link from 'next/link'
import ServingsScaler from './ServingsScaler'

interface Props {
  recipeId: string
  title: string
  servings: number
  baseServings: number
  onServingsChange: (n: number) => void
  wakeLockActive: boolean
}

export default function CookHeader({
  recipeId,
  title,
  servings,
  baseServings: _baseServings,
  onServingsChange,
  wakeLockActive,
}: Props) {
  return (
    <header
      style={{ backgroundColor: '#1F2D26' }}
      className="fixed top-0 left-0 right-0 z-40 h-14 flex items-center px-4 gap-3"
    >
      {/* Exit link */}
      <Link
        href={`/recipes/${recipeId}`}
        className="text-white/80 hover:text-white text-sm flex items-center gap-1 shrink-0"
        aria-label="Exit cook mode"
      >
        ← <span className="hidden sm:inline">Exit cook mode</span>
      </Link>

      {/* Title */}
      <h1 className="flex-1 text-white font-medium text-sm truncate text-center font-sans">
        {title}
      </h1>

      {/* Right: scaler + wake lock dot */}
      <div className="flex items-center gap-2 shrink-0">
        <ServingsScaler value={servings} onChange={onServingsChange} />
        {wakeLockActive && (
          <span
            aria-label="Screen awake"
            className="w-2 h-2 rounded-full bg-green-400"
          />
        )}
      </div>
    </header>
  )
}
