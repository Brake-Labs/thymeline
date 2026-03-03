import { Suspense } from 'react'
import PreferencesPageContent from './PreferencesPageContent'

export default function PreferencesPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-gray-400">Loading…</div>}>
      <PreferencesPageContent />
    </Suspense>
  )
}
