'use client'

import { useState } from 'react'

interface MakeAgainPromptProps {
  entryId:  string
  recipeId: string
  onDismiss: () => void
}

export default function MakeAgainPrompt({ entryId, recipeId, onDismiss }: MakeAgainPromptProps) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle')
  const [selected, setSelected] = useState<'loved' | 'disliked' | null>(null)

  async function handleVote(makeAgain: boolean) {
    setSelected(makeAgain ? 'loved' : 'disliked')
    setStatus('saving')
    try {
      await fetch(`/api/recipes/${recipeId}/log/${entryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ makeAgain: makeAgain }),
      })
    } catch {
      // never block the user on this
    }
    setStatus('done')
    setTimeout(onDismiss, 1000)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-stone-700">How did it go?</p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleVote(true)}
          disabled={status !== 'idle'}
          className={
            selected === 'loved'
              ? 'px-3 py-1.5 rounded-full border border-sage-500 text-sm bg-sage-500 text-white'
              : 'px-3 py-1.5 rounded-full border border-stone-200 text-sm text-stone-600 bg-white'
          }
        >
          👍 Make again
        </button>
        <button
          onClick={() => handleVote(false)}
          disabled={status !== 'idle'}
          className={
            selected === 'disliked'
              ? 'px-3 py-1.5 rounded-full border border-red-200 text-sm bg-red-100 text-red-700'
              : 'px-3 py-1.5 rounded-full border border-stone-200 text-sm text-stone-600 bg-white'
          }
        >
          👎 Not for us
        </button>
        <button
          onClick={onDismiss}
          disabled={status !== 'idle'}
          className="text-xs text-stone-400 underline"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
