'use client'

import { useState, useEffect } from 'react'
import { LimitedTag } from '@/types'
import StepperInput from './StepperInput'
import CooldownSlider from './CooldownSlider'
import TagBucketPicker from './TagBucketPicker'
import { getAccessToken } from '@/lib/supabase/browser'

interface SectionSaveButtonProps {
  onSave: () => Promise<void>
}

function SectionSaveButton({ onSave }: SectionSaveButtonProps) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')

  async function handleClick() {
    setState('saving')
    await onSave()
    setState('saved')
    setTimeout(() => setState('idle'), 2000)
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'saving'}
        className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
      >
        {state === 'saving' ? 'Saving…' : 'Save'}
      </button>
      {state === 'saved' && (
        <span className="text-sm text-green-600 font-medium">Saved ✓</span>
      )}
    </div>
  )
}

interface PreferencesFormProps {
  allTags: string[]
}

interface PrefsState {
  options_per_day: number
  cooldown_days: number
  seasonal_mode: boolean
  preferred_tags: string[]
  avoided_tags: string[]
  limited_tags: LimitedTag[]
}

export default function PreferencesForm({ allTags }: PreferencesFormProps) {
  const [prefs, setPrefs] = useState<PrefsState>({
    options_per_day: 3,
    cooldown_days: 28,
    seasonal_mode: true,
    preferred_tags: [],
    avoided_tags: [],
    limited_tags: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPrefs() {
      try {
        const r = await fetch('/api/preferences', {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
        })
        const data: PrefsState = await r.json()
        setPrefs(data)
        setLoading(false)
      } catch {
        setLoading(false)
      }
    }
    fetchPrefs()
  }, [])

  async function patch(fields: Partial<PrefsState>) {
    const res = await fetch('/api/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getAccessToken()}`,
      },
      body: JSON.stringify(fields),
    })
    if (res.ok) {
      const updated: PrefsState = await res.json()
      setPrefs(updated)
    }
  }

  // Tag bucket exclusivity helpers
  const preferredSet = new Set(prefs.preferred_tags)
  const limitedSet = new Set(prefs.limited_tags.map((lt) => lt.tag))
  const avoidedSet = new Set(prefs.avoided_tags)

  const availableForPreferred = allTags.filter((t) => !limitedSet.has(t) && !avoidedSet.has(t))
  const availableForLimited = allTags.filter((t) => !preferredSet.has(t) && !avoidedSet.has(t))
  const availableForAvoided = allTags.filter((t) => !preferredSet.has(t) && !limitedSet.has(t))

  if (loading) {
    return <div className="py-12 text-center text-gray-400">Loading preferences…</div>
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
      <h1 className="font-display text-2xl font-bold text-gray-900">Preferences</h1>

      {/* Section 1: Planning Defaults */}
      <section className="space-y-4 border-b pb-8">
        <h2 className="font-display text-lg font-semibold text-gray-800">Planning Defaults</h2>
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Options per day</label>
            <StepperInput
              value={prefs.options_per_day}
              min={1}
              max={5}
              onChange={(v) => setPrefs((p) => ({ ...p, options_per_day: v }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Recipe cooldown</label>
            <CooldownSlider
              value={prefs.cooldown_days}
              onChange={(v) => setPrefs((p) => ({ ...p, cooldown_days: v }))}
            />
          </div>
        </div>
        <SectionSaveButton
          onSave={() => patch({ options_per_day: prefs.options_per_day, cooldown_days: prefs.cooldown_days })}
        />
      </section>

      {/* Section 2: Preferred Tags */}
      <section className="space-y-4 border-b pb-8">
        <h2 className="font-display text-lg font-semibold text-gray-800">Preferred Tags</h2>
        <p className="text-sm text-gray-500">{"We'll prioritize these when suggesting meals."}</p>
        <TagBucketPicker
          bucket="preferred"
          selected={prefs.preferred_tags}
          available={availableForPreferred}
          onChange={(tags) => setPrefs((p) => ({ ...p, preferred_tags: tags as string[] }))}
        />
        <SectionSaveButton onSave={() => patch({ preferred_tags: prefs.preferred_tags })} />
      </section>

      {/* Section 3: Limited Tags */}
      <section className="space-y-4 border-b pb-8">
        <h2 className="font-display text-lg font-semibold text-gray-800">Limited Tags</h2>
        <p className="text-sm text-gray-500">These can appear in your plan, but only up to a set number per week.</p>
        <TagBucketPicker
          bucket="limited"
          selected={prefs.limited_tags.map((lt) => lt.tag)}
          selectedLimited={prefs.limited_tags}
          available={availableForLimited}
          onChange={(tags) => setPrefs((p) => ({ ...p, limited_tags: tags as LimitedTag[] }))}
        />
        <SectionSaveButton onSave={() => patch({ limited_tags: prefs.limited_tags })} />
      </section>

      {/* Section 4: Avoided Tags */}
      <section className="space-y-4 border-b pb-8">
        <h2 className="font-display text-lg font-semibold text-gray-800">Avoided Tags</h2>
        <p className="text-sm text-gray-500">{"We'll never suggest recipes with these tags."}</p>
        <TagBucketPicker
          bucket="avoided"
          selected={prefs.avoided_tags}
          available={availableForAvoided}
          onChange={(tags) => setPrefs((p) => ({ ...p, avoided_tags: tags as string[] }))}
        />
        <SectionSaveButton onSave={() => patch({ avoided_tags: prefs.avoided_tags })} />
      </section>

      {/* Section 5: Seasonal Mode */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-gray-800">Seasonal Mode</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={prefs.seasonal_mode}
            onClick={() => setPrefs((p) => ({ ...p, seasonal_mode: !p.seasonal_mode }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              prefs.seasonal_mode ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                prefs.seasonal_mode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <div>
            <p className="text-sm font-medium text-gray-700">Seasonal suggestions</p>
            <p className="text-xs text-gray-500">When on, Forkcast adjusts suggestions based on the current season.</p>
          </div>
        </div>
        <SectionSaveButton onSave={() => patch({ seasonal_mode: prefs.seasonal_mode })} />
      </section>
    </div>
  )
}
