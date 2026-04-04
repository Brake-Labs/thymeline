'use client'

import { useRouter } from 'next/navigation'
import type { PantryMatch } from '@/types'

interface PantryMatchSheetProps {
  matches: PantryMatch[]
  loading: boolean
  onClose: () => void
}

export default function PantryMatchSheet({ matches, loading, onClose }: PantryMatchSheetProps) {
  const router = useRouter()

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-stone-100">
          <h2 className="font-display font-semibold text-stone-800">What can I make?</h2>
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
          {loading ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-8 h-8 border-2 border-sage-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-stone-500">Finding matches&hellip;</p>
            </div>
          ) : matches.length === 0 ? (
            <p className="text-sm text-stone-500 text-center py-4">
              No close matches found. Try adding more pantry items.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-stone-100">
              {matches.map((match) => (
                <button
                  key={match.recipe_id}
                  type="button"
                  onClick={() => { router.push(`/recipes/${match.recipe_id}`); onClose() }}
                  className="py-3 text-left hover:bg-stone-50 transition-colors rounded-lg px-2 -mx-2"
                >
                  <div className="font-medium text-sm text-stone-800">{match.recipe_title}</div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    Uses {match.match_count} of your pantry item{match.match_count !== 1 ? 's' : ''}
                  </div>
                  {match.matched_items.length > 0 && (
                    <div className="text-xs text-stone-400 mt-1">
                      {match.matched_items.join(', ')}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
