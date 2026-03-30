'use client'

import ErrorFallback from '@/components/ErrorFallback'

export default function AuthError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      message="We couldn&#39;t complete the sign-in process. Please try again."
      backHref="/login"
      backLabel="Back to login"
    />
  )
}
