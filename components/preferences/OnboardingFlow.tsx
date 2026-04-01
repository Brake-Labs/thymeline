'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LimitedTag } from '@/types'
import StepperInput from './StepperInput'
import CooldownSlider from './CooldownSlider'
import TagBucketPicker from './TagBucketPicker'
import { getAccessToken } from '@/lib/supabase/browser'

interface OnboardingState {
  options_per_day: number
  cooldown_days: number
  preferred_tags: string[]
  limited_tags: LimitedTag[]
  avoided_tags: string[]
}

interface OnboardingFlowProps {
  allTags: string[]
}

export default function OnboardingFlow({ allTags }: OnboardingFlowProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [values, setValues] = useState<OnboardingState>({
    options_per_day: 3,
    cooldown_days: 28,
    preferred_tags: [],
    limited_tags: [],
    avoided_tags: [],
  })
  const [saving, setSaving] = useState(false)

  const totalSteps = 4

  const preferredSet = new Set(values.preferred_tags)
  const limitedSet = new Set(values.limited_tags.map((lt) => lt.tag))

  const availableForLimited = allTags.filter((t) => !preferredSet.has(t))
  const availableForAvoided = allTags.filter((t) => !preferredSet.has(t) && !limitedSet.has(t))

  async function saveAndRedirect(payload: Record<string, unknown>) {
    setSaving(true)
    await fetch('/api/preferences', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getAccessToken()}`,
      },
      body: JSON.stringify(payload),
    })
    router.push('/recipes')
  }

  async function handleDone() {
    await saveAndRedirect({
      options_per_day: values.options_per_day,
      cooldown_days: values.cooldown_days,
      preferred_tags: values.preferred_tags,
      limited_tags: values.limited_tags,
      avoided_tags: values.avoided_tags,
      onboarding_completed: true,
    })
  }

  async function handleSkip() {
    await saveAndRedirect({ onboarding_completed: true })
  }

  function handlePreferredChange(tags: string[] | LimitedTag[]) {
    const newPreferred = tags as string[]
    // Remove any newly-preferred tags from limited/avoided
    setValues((prev) => ({
      ...prev,
      preferred_tags: newPreferred,
      limited_tags: prev.limited_tags.filter((lt) => !newPreferred.includes(lt.tag)),
      avoided_tags: prev.avoided_tags.filter((t) => !newPreferred.includes(t)),
    }))
  }

  function handleLimitedChange(tags: string[] | LimitedTag[]) {
    const newLimited = tags as LimitedTag[]
    const newLimitedNames = newLimited.map((lt) => lt.tag)
    setValues((prev) => ({
      ...prev,
      limited_tags: newLimited,
      avoided_tags: prev.avoided_tags.filter((t) => !newLimitedNames.includes(t)),
    }))
  }

  function handleAvoidedChange(tags: string[] | LimitedTag[]) {
    setValues((prev) => ({ ...prev, avoided_tags: tags as string[] }))
  }

  const dots = Array.from({ length: totalSteps }, (_, i) => i + 1)

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm p-8 space-y-6">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-stone-500">Step {step} of {totalSteps}</p>
            <button
              type="button"
              onClick={handleSkip}
              disabled={saving}
              className="text-sm text-stone-400 hover:text-stone-600 underline"
            >
              Skip for now
            </button>
          </div>
          <div className="flex gap-1.5">
            {dots.map((n) => (
              <div
                key={n}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  n <= step ? 'bg-sage-500' : 'bg-stone-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="space-y-4">
          {step === 1 && (
            <>
              <h2 className="font-display text-xl font-semibold text-stone-900">How many meal options do you want each day?</h2>
              <p className="text-sm text-stone-500">{"We'll show you this many recipe choices for each day you're planning."}</p>
              <div className="py-2">
                <StepperInput
                  value={values.options_per_day}
                  min={1}
                  max={5}
                  onChange={(v) => setValues((prev) => ({ ...prev, options_per_day: v }))}
                  label="Options per day"
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-display text-xl font-semibold text-stone-900">How soon can a recipe repeat?</h2>
              <p className="text-sm text-stone-500">{"We won't suggest a recipe you've made more recently than this."}</p>
              <div className="py-2">
                <CooldownSlider
                  value={values.cooldown_days}
                  onChange={(v) => setValues((prev) => ({ ...prev, cooldown_days: v }))}
                />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-display text-xl font-semibold text-stone-900">What kinds of meals do you prefer?</h2>
              <p className="text-sm text-stone-500">{"We'll prioritize these when suggesting meals."}</p>
              <div className="py-2">
                <TagBucketPicker
                  bucket="preferred"
                  selected={values.preferred_tags}
                  available={allTags}
                  onChange={handlePreferredChange}
                />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="font-display text-xl font-semibold text-stone-900">Any tags to limit or avoid?</h2>
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="font-display font-medium text-stone-800">Limit</h3>
                  <p className="text-sm text-stone-500">These can appear in your plan, but only up to a set number per week.</p>
                  <TagBucketPicker
                    bucket="limited"
                    selected={values.limited_tags.map((lt) => lt.tag)}
                    selectedLimited={values.limited_tags}
                    available={availableForLimited}
                    onChange={handleLimitedChange}
                  />
                </div>
                <div className="space-y-2">
                  <h3 className="font-display font-medium text-stone-800">Avoid</h3>
                  <p className="text-sm text-stone-500">{"We'll never suggest recipes with these tags."}</p>
                  <TagBucketPicker
                    bucket="avoided"
                    selected={values.avoided_tags}
                    available={availableForAvoided}
                    onChange={handleAvoidedChange}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < totalSteps ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="px-6 py-2 bg-sage-500 text-white text-sm font-medium rounded-lg hover:bg-sage-600"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDone}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
