'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { GeneratedRecipe, GenerateRefinementMessage } from '@/types'

interface GenerateRecipeChatPanelProps {
  initialRecipe:     GeneratedRecipe
  generationContext: {
    mealType:            string
    styleHints:          string
    dietaryRestrictions: string[]
  }
  onUseRecipe:  (recipe: GeneratedRecipe) => void
  onStartOver:  () => void
}

export default function GenerateRecipeChatPanel({
  initialRecipe,
  generationContext,
  onUseRecipe,
  onStartOver,
}: GenerateRecipeChatPanelProps) {
  const [currentRecipe, setCurrentRecipe]           = useState<GeneratedRecipe>(initialRecipe)
  const [conversationHistory, setConversationHistory] = useState<GenerateRefinementMessage[]>([])
  const [inputValue, setInputValue]   = useState('')
  const [isLoading, setIsLoading]     = useState(false)
  const [isExpanded, setIsExpanded]   = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const chatBottomRef      = useRef<HTMLDivElement>(null)

  // Scroll to bottom whenever history or loading state changes
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [conversationHistory, isLoading])

  const ingredientCount = currentRecipe.ingredients.split('\n').filter(Boolean).length
  const stepCount       = currentRecipe.steps.split('\n').filter(Boolean).length
  const totalTime       = currentRecipe.totalTimeMinutes

  function abortInFlight() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }

  function handleUseRecipe() {
    abortInFlight()
    onUseRecipe(currentRecipe)
  }

  function handleStartOver() {
    abortInFlight()
    onStartOver()
  }

  async function handleSend() {
    const trimmed = inputValue.trim()
    if (!trimmed || isLoading) return

    const userMessage: GenerateRefinementMessage = { role: 'user', content: trimmed }
    const updatedHistory = [...conversationHistory, userMessage]
    setConversationHistory(updatedHistory)
    setInputValue('')
    setIsLoading(true)

    // Only role+content in the API payload (no changes field)
    const historyForApi = updatedHistory.map(({ role, content }) => ({ role, content }))

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch('/api/recipes/generate/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message:              trimmed,
          currentRecipe:       currentRecipe,
          conversationHistory: historyForApi,
          generationContext:   generationContext,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        setConversationHistory((prev) => [
          ...prev,
          { role: 'assistant', content: 'Something went wrong — try again.' },
        ])
        return
      }

      const data: { message: string; changes: string[]; recipe: GeneratedRecipe } = await res.json()
      setCurrentRecipe(data.recipe)
      setConversationHistory((prev) => [
        ...prev,
        { role: 'assistant', content: data.message, changes: data.changes },
      ])
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setConversationHistory((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong — try again.' },
      ])
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="font-display font-semibold text-stone-800 text-base">Refine your recipe</h3>
        <p className="text-xs text-stone-500 mt-0.5">Make any changes before saving to your recipe box</p>
      </div>

      {/* Recipe preview */}
      <div className="border border-stone-200 rounded-xl p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="font-semibold text-stone-800 text-sm truncate">{currentRecipe.title}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-500">
              <span>{ingredientCount} ingredient{ingredientCount !== 1 ? 's' : ''}</span>
              <span>{stepCount} step{stepCount !== 1 ? 's' : ''}</span>
              {totalTime != null && <span>{totalTime} min total</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 flex-shrink-0"
            aria-label={isExpanded ? 'Collapse recipe' : 'View full recipe'}
          >
            {isExpanded ? (
              <>Hide <ChevronUp size={14} /></>
            ) : (
              <>View full recipe <ChevronDown size={14} /></>
            )}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-2 max-h-48 overflow-y-auto border-t border-stone-100 pt-2 space-y-3">
            <div>
              <p className="text-xs font-medium text-stone-600 mb-1">Ingredients</p>
              <pre className="text-xs text-stone-700 whitespace-pre-wrap font-sans leading-relaxed">
                {currentRecipe.ingredients}
              </pre>
            </div>
            <div>
              <p className="text-xs font-medium text-stone-600 mb-1">Steps</p>
              <pre className="text-xs text-stone-700 whitespace-pre-wrap font-sans leading-relaxed">
                {currentRecipe.steps}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="max-h-64 overflow-y-auto space-y-2 px-1">
        {conversationHistory.length === 0 && !isLoading && (
          <p className="text-stone-400 text-sm italic">
            Not quite right? Tell me what you&apos;d like to change.{' '}
            For example: &ldquo;I don&apos;t have heavy cream&rdquo;, &ldquo;make it gluten-free&rdquo;,
            &ldquo;reduce this to 2 servings&rdquo;, &ldquo;less spicy&rdquo;
          </p>
        )}

        {conversationHistory.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={[
                'max-w-[85%] rounded-2xl px-3 py-2',
                msg.role === 'user'
                  ? 'bg-stone-100 text-stone-800'
                  : 'bg-sage-50 text-stone-700',
              ].join(' ')}
            >
              <p className="text-[13px]">{msg.content}</p>
              {msg.role === 'assistant' && msg.changes && msg.changes.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {msg.changes.map((change: string, j: number) => (
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

        <div ref={chatBottomRef} />
      </div>

      {/* Input area */}
      <div className="flex gap-2">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What would you like to change?"
          disabled={isLoading}
          rows={2}
          className="flex-1 resize-none border border-stone-200 rounded-xl px-3 py-2 text-[13px] text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-sage-400 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={isLoading || !inputValue.trim()}
          className="self-end bg-sage-500 text-white rounded-xl px-4 py-2 text-[13px] font-medium hover:bg-sage-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>

      {/* Footer actions */}
      <div className="space-y-2 pt-1">
        <button
          type="button"
          onClick={handleUseRecipe}
          className="w-full bg-sage-600 text-white rounded-xl py-3 font-display font-semibold text-sm hover:bg-sage-700 transition-colors"
        >
          Use this recipe
        </button>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleStartOver}
            className="text-stone-500 text-xs underline hover:text-stone-700"
          >
            Start over
          </button>
        </div>
      </div>
    </div>
  )
}
