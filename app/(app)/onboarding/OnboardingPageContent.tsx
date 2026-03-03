'use client'

import { useEffect, useState } from 'react'
import OnboardingFlow from '@/components/preferences/OnboardingFlow'
import { getAccessToken } from '@/lib/supabase/browser'

export default function OnboardingPageContent() {
  const [allTags, setAllTags] = useState<string[]>([])

  useEffect(() => {
    async function fetchTags() {
      try {
        const r = await fetch('/api/tags', { headers: { Authorization: `Bearer ${await getAccessToken()}` } })
        const data: { id: string; name: string }[] = await r.json()
        if (Array.isArray(data)) setAllTags(data.map((t) => t.name))
      } catch {}
    }
    fetchTags()
  }, [])

  return <OnboardingFlow allTags={allTags} />
}
