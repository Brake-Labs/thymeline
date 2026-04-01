'use client'

import type { DiscoveryResult } from '@/types'

interface DiscoveryCardProps {
  result:    DiscoveryResult
  saved:     boolean
  onPreview: (result: DiscoveryResult) => void
  onDismiss: (url: string) => void
}

export default function DiscoveryCard({
  result,
  saved,
  onPreview,
  onDismiss,
}: DiscoveryCardProps) {
  const displayedTags = result.suggested_tags.slice(0, 3)

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-lg overflow-hidden flex flex-col">
      {/* Sage accent bar */}
      <div className="h-[3px] bg-sage-500" />

      <div className="p-4 flex flex-col flex-1 gap-3">
        {/* Source */}
        <div className="flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(result.site_name)}`}
            alt=""
            aria-hidden="true"
            className="w-4 h-4"
          />
          <span className="text-xs text-stone-500 truncate">{result.site_name}</span>
        </div>

        {/* Title */}
        <h3 className="font-display font-semibold text-sage-900 text-sm leading-snug line-clamp-2">
          {result.title}
        </h3>

        {/* Description */}
        {result.description && (
          <p className="text-sm text-stone-600 line-clamp-3">{result.description}</p>
        )}

        {/* Tags */}
        {displayedTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {displayedTags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-sage-50 text-sage-700"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Vault match badge */}
        {result.vault_match && (
          <div>
            {result.vault_match.similarity === 'exact' ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-medium">
                Already saved
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                Similar to {result.vault_match.similar_recipe_title}
              </span>
            )}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        {saved ? (
          <div>
            <span className="text-xs px-3 py-1.5 rounded-full bg-sage-500 text-white font-medium">
              Saved ✓
            </span>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPreview(result)}
              className="flex-1 bg-sage-500 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-sage-600 transition-colors"
            >
              Preview &amp; Save
            </button>
            <button
              type="button"
              onClick={() => onDismiss(result.url)}
              className="text-sm font-medium text-stone-500 px-3 py-2 rounded-lg border border-stone-200 hover:border-stone-300 hover:text-stone-700 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
