'use client'

import { useState, useEffect } from 'react'
import { LimitedTag } from '@/types'
import StepperInput from './StepperInput'
import CooldownSlider from './CooldownSlider'
import TagBucketPicker from './TagBucketPicker'
import { getAccessToken } from '@/lib/supabase/browser'
import { TOAST_DURATION_MS } from '@/lib/constants'

interface SectionSaveButtonProps {
  onSave: () => Promise<void>
}

function SectionSaveButton({ onSave }: SectionSaveButtonProps) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleClick() {
    setState('saving')
    setErrorMsg(null)
    try {
      await onSave()
      setState('saved')
      setTimeout(() => setState('idle'), TOAST_DURATION_MS)
    } catch (err) {
      setState('error')
      setErrorMsg('Changes couldn\'t be saved. Please try again.')
      console.error(err)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleClick}
          disabled={state === 'saving'}
          className="px-4 py-1.5 bg-sage-500 text-white text-sm font-medium rounded-lg hover:bg-sage-600 disabled:opacity-60"
        >
          {state === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {state === 'saved' && (
          <span className="text-sm text-sage-600 font-medium">Saved ✓</span>
        )}
      </div>
      {errorMsg && (
        <p className="text-red-500 text-sm mt-2">{errorMsg}</p>
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

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[4px] border border-stone-200 bg-stone-50 overflow-hidden">
      <div className="h-[3px] bg-sage-500" />
      <div className="px-5 py-5 space-y-4">
        {children}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display font-bold text-[10px] uppercase tracking-[0.12em] text-sage-500">
      {children}
    </h2>
  )
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
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPrefs() {
      try {
        const r = await fetch('/api/preferences', {
          headers: { Authorization: `Bearer ${await getAccessToken()}` },
        })
        if (!r.ok) throw new Error('Failed to load preferences')
        const data: PrefsState = await r.json()
        setPrefs(data)
        setLoadError(null)
        setLoading(false)
      } catch (err) {
        setLoadError('Something went wrong loading your preferences.')
        console.error(err)
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
      // Only merge the saved fields — don't overwrite unsaved selections in other sections
      setPrefs((prev) => ({ ...prev, ...fields }))
    } else {
      throw new Error('Save failed')
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
    return <div className="py-12 text-center text-stone-400">Loading preferences…</div>
  }

  return (
    <div className="min-h-screen bg-stone-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className="font-display text-2xl font-bold text-stone-900">Preferences</h1>

        {loadError && (
          <p className="text-red-500 text-sm mt-2">{loadError}</p>
        )}

        {/* Section 1: Planning Defaults */}
        <SectionCard>
          <SectionTitle>Planning Defaults</SectionTitle>
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Options offered per day</label>
              <StepperInput
                value={prefs.options_per_day}
                min={1}
                max={5}
                onChange={(v) => setPrefs((p) => ({ ...p, options_per_day: v }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Recipe cooldown</label>
              <CooldownSlider
                value={prefs.cooldown_days}
                onChange={(v) => setPrefs((p) => ({ ...p, cooldown_days: v }))}
              />
            </div>
          </div>
          <SectionSaveButton
            onSave={() => patch({ options_per_day: prefs.options_per_day, cooldown_days: prefs.cooldown_days })}
          />
        </SectionCard>

        {/* Section 2: Preferred Tags */}
        <SectionCard>
          <SectionTitle>Preferred Tags</SectionTitle>
          <p className="text-sm text-stone-500">{"We'll prioritize these when suggesting meals."}</p>
          <TagBucketPicker
            bucket="preferred"
            selected={prefs.preferred_tags}
            available={availableForPreferred}
            onChange={(tags) => setPrefs((p) => ({ ...p, preferred_tags: tags as string[] }))}
          />
          <SectionSaveButton onSave={() => patch({ preferred_tags: prefs.preferred_tags })} />
        </SectionCard>

        {/* Section 3: Limited Tags */}
        <SectionCard>
          <SectionTitle>Limited Tags</SectionTitle>
          <p className="text-sm text-stone-500">These can appear in your plan, but only up to a set number per week.</p>
          <TagBucketPicker
            bucket="limited"
            selected={prefs.limited_tags.map((lt) => lt.tag)}
            selectedLimited={prefs.limited_tags}
            available={availableForLimited}
            onChange={(tags) => setPrefs((p) => ({ ...p, limited_tags: tags as LimitedTag[] }))}
          />
          <SectionSaveButton onSave={() => patch({ limited_tags: prefs.limited_tags })} />
        </SectionCard>

        {/* Section 4: Avoided Tags */}
        <SectionCard>
          <SectionTitle>Avoided Tags</SectionTitle>
          <p className="text-sm text-stone-500">{"We'll never suggest recipes with these tags."}</p>
          <TagBucketPicker
            bucket="avoided"
            selected={prefs.avoided_tags}
            available={availableForAvoided}
            onChange={(tags) => setPrefs((p) => ({ ...p, avoided_tags: tags as string[] }))}
          />
          <SectionSaveButton onSave={() => patch({ avoided_tags: prefs.avoided_tags })} />
        </SectionCard>

        {/* Section 5: Seasonal Mode */}
        <SectionCard>
          <SectionTitle>Seasonal Mode</SectionTitle>
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={prefs.seasonal_mode}
              onClick={() => setPrefs((p) => ({ ...p, seasonal_mode: !p.seasonal_mode }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 ${
                prefs.seasonal_mode ? 'bg-sage-500' : 'bg-stone-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  prefs.seasonal_mode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <div>
              <p className="text-sm font-medium text-stone-700">Seasonal suggestions</p>
              <p className="text-xs text-stone-500">When on, Forkcast adjusts suggestions based on the current season.</p>
            </div>
          </div>
          <SectionSaveButton onSave={() => patch({ seasonal_mode: prefs.seasonal_mode })} />
        </SectionCard>
      </div>
    </div>
  )
}
