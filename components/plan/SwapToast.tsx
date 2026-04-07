'use client'

import { useEffect } from 'react'

interface SwapToastProps {
  entryIdA: string
  entryIdB: string
  onUndo: (idA: string, idB: string) => void
  onDismiss: () => void
}

export default function SwapToast({ entryIdA, entryIdB, onUndo, onDismiss }: SwapToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-stone-800 text-white rounded-lg px-4 py-3 flex items-center gap-4 text-sm shadow-lg">
      <span>Meals swapped ✓</span>
      <button
        className="underline text-sage-300 hover:text-sage-200"
        onClick={() => {
          onUndo(entryIdA, entryIdB)
          onDismiss()
        }}
      >
        Undo
      </button>
    </div>
  )
}
