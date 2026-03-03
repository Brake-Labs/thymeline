'use client'

import { useEffect, useState } from 'react'
import OnboardingFlow from '@/components/preferences/OnboardingFlow'

function getToken(): string {
  if (typeof window === 'undefined') return ''
  return (window as Window & { __supabaseToken?: string }).__supabaseToken ?? ''
}

export default function OnboardingPageContent() {
  const [allTags, setAllTags] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/tags', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) => {
        if (Array.isArray(data)) setAllTags(data.map((t) => t.name))
      })
      .catch(() => {})
  }, [])

  return <OnboardingFlow allTags={allTags} />
}
