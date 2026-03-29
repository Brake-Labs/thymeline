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
  unitSystem: 'imperial' | 'metric'
  onUnitSystemChange: (u: 'imperial' | 'metric') => void
}

export default function CookHeader({
  recipeId,
  title,
  servings,
  baseServings: _baseServings,
  onServingsChange,
  wakeLockActive,
  unitSystem,
  onUnitSystemChange,
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

      {/* Right: unit toggle + scaler + wake lock dot */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Unit segmented control */}
        <div className="flex rounded-lg overflow-hidden border border-white/20 text-xs font-medium">
          {(['imperial', 'metric'] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onUnitSystemChange(u)}
              className={`px-2.5 py-1 transition-colors ${
                unitSystem === u
                  ? 'bg-sage-500 text-white'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              {u === 'imperial' ? 'imp' : 'met'}
            </button>
          ))}
        </div>
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
