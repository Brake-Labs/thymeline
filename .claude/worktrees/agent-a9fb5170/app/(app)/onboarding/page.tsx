import { Suspense } from 'react'
import OnboardingPageContent from './OnboardingPageContent'

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading…</div>}>
      <OnboardingPageContent />
    </Suspense>
  )
}
