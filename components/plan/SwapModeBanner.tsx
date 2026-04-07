'use client'

interface SwapModeBannerProps {
  hasSelection: boolean
  onCancel: () => void
}

export default function SwapModeBanner({ hasSelection, onCancel }: SwapModeBannerProps) {
  return (
    <div className="flex items-center justify-between bg-sage-50 border border-sage-200 rounded-lg px-4 py-2 text-sm text-sage-800">
      <span>
        {hasSelection ? 'Now tap a meal to swap with' : 'Tap a meal to select it'}
      </span>
      <button
        onClick={onCancel}
        className="ml-4 text-sage-600 hover:text-sage-800 font-medium"
      >
        Cancel
      </button>
    </div>
  )
}
