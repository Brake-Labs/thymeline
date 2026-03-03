import { Suspense } from 'react'
import RecipePageContent from './RecipePageContent'

export default function RecipesPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-4 py-8 text-gray-400">Loading…</div>}>
      <RecipePageContent />
    </Suspense>
  )
}
