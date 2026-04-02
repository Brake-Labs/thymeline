'use client'

import { useState, useEffect, useRef } from 'react'
import type { Recipe, ModifiedRecipe, AIEditMessage } from '@/types'
import { getAccessToken } from '@/lib/supabase/browser'

interface AIEditSheetProps {
  recipe:         Recipe
  isOpen:         boolean
  onClose:        () => void
  onCookModified: (modified: ModifiedRecipe) => void
  onSaveAsNew:    (modified: ModifiedRecipe) => void
}

function toModifiedRecipe(r: Recipe): ModifiedRecipe {
  return {
    title:       r.title,
    ingredients: r.ingredients ?? '',
    steps:       r.steps ?? '',
    notes:       r.notes,
    servings:    r.servings,
  }
}

export default function AIEditSheet({
  recipe,
  isOpen,
  onClose,
  onCookModified,
  onSaveAsNew,
}: AIEditSheetProps) {
  const [currentRecipe, setCurrentRecipe]       = useState<ModifiedRecipe>(toModifiedRecipe(recipe))
  const [history, setHistory]                    = useState<AIEditMessage[]>([])
  const [input, setInput]                        = useState('')
  const [isLoading, setIsLoading]                = useState(false)
  const [error, setError]                        = useState<string | null>(null)
  const [hasModifications, setHasModifications]  = useState(false)

  const chatBottomRef = useRef<HTMLDivElement>(null)

  // Reset state when recipe changes
  useEffect(() => {
    setCurrentRecipe(toModifiedRecipe(recipe))
    setHistory([])
    setInput('')
    setIsLoading(false)
    setError(null)
    setHasModifications(false)
  }, [recipe.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll chat to bottom when history updates
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [history, isLoading])

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed) return

    const userMessage: AIEditMessage = { role: 'user', content: trimmed }
    const updatedHistory = [...history, userMessage]
    setHistory(updatedHistory)
    setInput('')
    setIsLoading(true)
    setError(null)

    // Send only role + content fields (no changes) in history
    const historyForApi = updatedHistory.map(({ role, content }) => ({ role, content }))

    try {
      const token = await getAccessToken()
      const res = await fetch(`/api/recipes/${recipe.id}/ai-edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: trimmed,
          current_recipe: currentRecipe,
          conversation_history: historyForApi,
        }),
      })

      if (!res.ok) {
        setError('Something went wrong — try again.')
        return
      }

      const data: { message: string; recipe: ModifiedRecipe; changes: string[] } = await res.json()
      setCurrentRecipe(data.recipe)
      setHistory((prev) => [
        ...prev,
        { role: 'assistant', content: data.message, changes: data.changes },
      ])
      setHasModifications(true)
    } catch {
      setError('Something went wrong — try again.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleReset() {
    setCurrentRecipe(toModifiedRecipe(recipe))
    setHistory([])
    setHasModifications(false)
    setError(null)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet — mobile: bottom sheet, desktop: side panel */}
      <div
        className={[
          'fixed z-50 bg-white flex flex-col',
          // Mobile
          'inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl',
          // Desktop
          'md:inset-x-auto md:right-0 md:top-0 md:h-full md:w-[400px] md:max-h-none md:rounded-none md:shadow-xl',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label="Edit with AI"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-stone-100 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="font-display font-semibold text-stone-800">Edit with AI</h2>
            <p className="text-[11px] text-stone-400 mt-0.5">
              Changes are temporary — your saved recipe won&apos;t be affected
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 text-2xl leading-none ml-4 flex-shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {history.length === 0 && !isLoading && (
            <p className="text-stone-400 text-sm italic">
              Tell me what you&apos;d like to change. For example: &quot;I don&apos;t have chickpeas&quot;,
              &quot;make it less spicy&quot;, &quot;make it gluten-free&quot;,
              &quot;I only have 2 chicken breasts instead of 4&quot;
            </p>
          )}

          {history.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={[
                  'max-w-[85%] rounded-2xl px-3 py-2',
                  msg.role === 'user'
                    ? 'bg-sage-100 text-stone-800'
                    : 'bg-stone-100 text-stone-700',
                ].join(' ')}
              >
                <p className="text-[13px]">{msg.content}</p>
                {msg.role === 'assistant' && msg.changes && msg.changes.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {msg.changes.map((change, j) => (
                      <li key={j} className="text-[12px] text-stone-500 flex gap-1">
                        <span>•</span>
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-stone-100 text-stone-700 rounded-2xl px-3 py-2 flex items-center gap-2">
                <span className="inline-block h-3 w-3 border-2 border-stone-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-[13px]">Thinking…</span>
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Input area */}
        <div className="px-4 py-3 border-t border-stone-100 flex gap-2 flex-shrink-0">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What would you like to change?"
            disabled={isLoading}
            rows={2}
            className="flex-1 resize-none border border-stone-200 rounded-xl px-3 py-2 text-[13px] text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-sage-400 disabled:opacity-50"
          />
          <button
            onClick={() => void handleSend()}
            disabled={isLoading || !input.trim()}
            className="self-end bg-sage-500 text-white rounded-xl px-4 py-2 text-[13px] font-medium hover:bg-sage-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>

        {/* Footer actions — shown only when hasModifications */}
        {hasModifications && (
          <div className="px-4 py-3 border-t border-stone-100 flex flex-col gap-2 flex-shrink-0">
            <div className="flex gap-2">
              <button
                onClick={() => onCookModified(currentRecipe)}
                className="flex-1 bg-sage-500 text-white rounded-xl py-2 text-[13px] font-medium hover:bg-sage-600"
              >
                Cook from this version
              </button>
              <button
                onClick={() => onSaveAsNew(currentRecipe)}
                className="flex-1 border border-sage-300 text-sage-700 rounded-xl py-2 text-[13px] font-medium hover:bg-sage-50"
              >
                Save as new recipe
              </button>
            </div>
            <div className="flex justify-center">
              <button
                onClick={handleReset}
                className="text-stone-400 text-xs underline"
              >
                Reset changes
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
