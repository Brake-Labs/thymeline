'use client'

import { useRouter } from 'next/navigation'

export default function AuthError({ error: _error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="text-stone-400 font-sans text-sm mb-2">Something went wrong</p>
        <h1 className="font-display text-2xl font-bold text-stone-900 mb-2">We hit a snag</h1>
        <p className="text-stone-500 font-sans text-sm mb-6">
          We couldn&#39;t complete the sign-in process. Please try again.
        </p>
        <button
          onClick={() => { reset(); router.refresh() }}
          className="bg-sage-500 text-white hover:bg-sage-600 rounded-full px-6 py-2 text-sm font-medium transition-colors"
        >
          Try again
        </button>
        <div className="mt-4">
          <a href="/login" className="text-stone-400 text-sm hover:text-stone-500 transition-colors">
            Back to login
          </a>
        </div>
      </div>
    </div>
  )
}
