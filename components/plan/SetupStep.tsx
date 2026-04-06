'use client'

import { useEffect, useState } from 'react'
import WeekPicker from './WeekPicker'
import DayTogglePicker from './DayTogglePicker'
import MealTypePicker from './MealTypePicker'
import TagBucketPicker from '@/components/preferences/TagBucketPicker'
import { getAccessToken } from '@/lib/supabase/browser'
import type { PlanSetup } from '@/types'

interface SetupStepProps {
  setup: PlanSetup
  weekStartDay?: number
  onSetupChange: (updates: Partial<PlanSetup>) => void
  onGetSuggestions: () => void
  isGenerating: boolean
}

export default function SetupStep({ setup, weekStartDay = 0, onSetupChange, onGetSuggestions, isGenerating }: SetupStepProps) {
  const [allTags, setAllTags] = useState<string[]>([])
  const [tagsExpanded, setTagsExpanded] = useState(false)

  useEffect(() => {
    async function loadTags() {
      const token = await getAccessToken()
      const res = await fetch('/api/tags', { headers: { Authorization: `Bearer ${token}` } })
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

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div>
        <h2 className="font-display text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">Week</h2>
        <WeekPicker
          weekStart={setup.weekStart}
          weekStartDay={weekStartDay}
          onChange={(weekStart) => onSetupChange({ weekStart })}
        />
      </div>

      <div>
        <h2 className="font-display text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">
          Which days are you planning?
        </h2>
        <DayTogglePicker
          weekStart={setup.weekStart}
          activeDates={setup.activeDates}
          onChange={(activeDates) => onSetupChange({ activeDates })}
        />
      </div>

      <div>
        <h2 className="font-display text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">
          Which meals are you planning?
        </h2>
        <MealTypePicker
          selected={setup.activeMealTypes}
          onChange={(activeMealTypes) => onSetupChange({ activeMealTypes })}
        />
      </div>

      <div>
        <h2 className="font-display text-sm font-semibold text-stone-500 uppercase tracking-wider mb-1">
          Context for this week
        </h2>
        <p className="text-xs text-stone-400 mb-2">{"e.g. \"Busy week, keep it quick\" or \"Feeling adventurous\""}</p>
        <div className="relative">
          <textarea
            value={setup.freeText}
            onChange={(e) => onSetupChange({ freeText: e.target.value.slice(0, 300) })}
            maxLength={300}
            rows={2}
            placeholder="Anything to keep in mind this week?"
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-800 placeholder-stone-300 resize-none focus:outline-none focus:ring-2 focus:ring-sage-500"
          />
          <span className="absolute bottom-2 right-2 text-xs text-stone-400">
            {setup.freeText.length}/300
          </span>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setTagsExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-700 transition-colors"
        >
          <span className="font-display text-sm font-semibold uppercase tracking-wider">
            Prefer / Avoid this week
          </span>
          {(setup.preferThisWeek.length > 0 || setup.avoidThisWeek.length > 0) && (
            <span className="text-xs bg-sage-100 text-sage-700 rounded-full px-2 py-0.5 font-medium">
              {setup.preferThisWeek.length + setup.avoidThisWeek.length} selected
            </span>
          )}
          <span className="text-stone-400 text-xs">{tagsExpanded ? '▲' : '▼'}</span>
        </button>

        {tagsExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">
                Prefer this week
              </h2>
              <TagBucketPicker
                bucket="preferred"
                selected={setup.preferThisWeek}
                available={allTags}
                onChange={(val) => onSetupChange({ preferThisWeek: val as string[] })}
              />
            </div>
            <div>
              <h2 className="font-display text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">
                Avoid this week
              </h2>
              <TagBucketPicker
                bucket="avoided"
                selected={setup.avoidThisWeek}
                available={avoidAvailable}
                onChange={(val) => onSetupChange({ avoidThisWeek: val as string[] })}
              />
            </div>
          </div>
        )}
      </div>

      <button
        onClick={onGetSuggestions}
        disabled={isDisabled}
        className="font-display w-full sm:w-auto px-6 py-3 rounded-lg bg-sage-500 text-white font-medium text-sm hover:bg-sage-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {isGenerating ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Finding your meals…
          </>
        ) : (
          'Get Suggestions'
        )}
      </button>
    </div>
  )
}
