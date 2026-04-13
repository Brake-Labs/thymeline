'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import WeekPicker from './WeekPicker'
import DayTogglePicker from './DayTogglePicker'
import MealTypePicker from './MealTypePicker'
import TagBucketPicker from '@/components/preferences/TagBucketPicker'
import type { PlanSetup } from '@/types'
import { DAY_NAMES } from '@/lib/date-utils'

interface ContextScreenProps {
  setup: PlanSetup
  weekStartDay?: number
  onSetupChange: (updates: Partial<PlanSetup>) => void
  onGenerate: () => void
  isGenerating: boolean
  existingPlanForWeek: boolean
}

export default function ContextScreen({
  setup, weekStartDay = 0, onSetupChange, onGenerate, isGenerating, existingPlanForWeek,
}: ContextScreenProps) {
  const [allTags, setAllTags] = useState<string[]>([])
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    async function loadTags() {
      const res = await fetch('/api/tags')
      if (res.ok) {
        const data = await res.json()
        setAllTags([
          ...(data.firstClass ?? []).map((t: { name: string }) => t.name),
          ...(data.custom ?? []).map((t: { name: string; section: string }) => t.name),
        ])
      }
    }
    loadTags()
  }, [])

  const avoidAvailable = allTags.filter((t) => !setup.preferThisWeek.includes(t))
  const isDisabled = setup.activeDates.length === 0 || isGenerating

  const settingsCount = (() => {
    let count = 0
    if (setup.preferThisWeek.length > 0) count += setup.preferThisWeek.length
    if (setup.avoidThisWeek.length > 0) count += setup.avoidThisWeek.length
    return count
  })()

  const handleGenerate = () => {
    // Persist lastActiveDays and lastActiveMealTypes (fire-and-forget)
    const dayNames = setup.activeDates.map((d) => {
      const dayOfWeek = new Date(d + 'T12:00:00Z').getUTCDay()
      return DAY_NAMES[dayOfWeek]
    })
    fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastActiveDays: dayNames,
        lastActiveMealTypes: setup.activeMealTypes,
      }),
    }).catch(() => { /* fire-and-forget */ })

    onGenerate()
  }

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {/* Week picker */}
      <div>
        <h2 className="font-display text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">Week</h2>
        <WeekPicker
          weekStart={setup.weekStart}
          weekStartDay={weekStartDay}
          onChange={(weekStart) => onSetupChange({ weekStart })}
        />
      </div>

      {/* Existing plan banner */}
      {existingPlanForWeek && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm text-amber-800">
            You already have a plan for this week. Generating will replace it.
          </p>
        </div>
      )}

      {/* Primary: Free text context */}
      <div>
        <h2 className="font-display text-sm font-semibold text-stone-500 uppercase tracking-wider mb-1">
          What&apos;s happening this week?
        </h2>
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={setup.freeText}
            onChange={(e) => {
              onSetupChange({ freeText: e.target.value.slice(0, 300) })
              adjustHeight()
            }}
            maxLength={300}
            placeholder="Anything special this week?"
            className="w-full min-h-[3rem] border border-stone-200 rounded-lg px-3 pb-6 py-2 text-sm text-stone-800 placeholder-stone-300 resize-none focus:outline-none focus:ring-2 focus:ring-sage-500 overflow-hidden"
          />
          <span className="absolute bottom-2 right-2 text-xs text-stone-400">
            {setup.freeText.length}/300
          </span>
        </div>
      </div>

      {/* Collapsible settings panel */}
      <div>
        <button
          type="button"
          onClick={() => setSettingsExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-700 transition-colors"
        >
          <span className="font-display text-sm font-semibold uppercase tracking-wider">
            Adjust settings
          </span>
          {settingsCount > 0 && (
            <span className="text-xs bg-sage-100 text-sage-700 rounded-full px-2 py-0.5 font-medium">
              {settingsCount} override{settingsCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-stone-400 text-xs">{settingsExpanded ? '▲' : '▼'}</span>
        </button>

        {settingsExpanded && (
          <div className="space-y-5 mt-4 pl-1">
            {/* Active days */}
            <div>
              <h3 className="font-display text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">
                Which days are you planning?
              </h3>
              <DayTogglePicker
                weekStart={setup.weekStart}
                activeDates={setup.activeDates}
                onChange={(activeDates) => onSetupChange({ activeDates })}
              />
            </div>

            {/* Meal types */}
            <div>
              <h3 className="font-display text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">
                Which meals are you planning?
              </h3>
              <MealTypePicker
                selected={setup.activeMealTypes}
                onChange={(activeMealTypes) => onSetupChange({ activeMealTypes })}
              />
            </div>

            {/* Tag overrides */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h3 className="font-display text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">
                  Prefer this week
                </h3>
                <TagBucketPicker
                  bucket="preferred"
                  selected={setup.preferThisWeek}
                  available={allTags}
                  onChange={(val) => onSetupChange({ preferThisWeek: val as string[] })}
                />
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">
                  Avoid this week
                </h3>
                <TagBucketPicker
                  bucket="avoided"
                  selected={setup.avoidThisWeek}
                  available={avoidAvailable}
                  onChange={(val) => onSetupChange({ avoidThisWeek: val as string[] })}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isDisabled}
        className="font-display w-full sm:w-auto px-6 py-3 rounded-lg bg-sage-500 text-white font-medium text-sm hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {isGenerating ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Finding your meals…
          </>
        ) : (
          'Generate'
        )}
      </button>
    </div>
  )
}
