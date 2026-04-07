'use client'

import { useEffect, useState } from 'react'
import OnboardingFlow from '@/components/preferences/OnboardingFlow'

export default function OnboardingPageContent() {
  const [allTags, setAllTags] = useState<string[]>([])

  useEffect(() => {
    async function fetchTags() {
      try {
        const r = await fetch('/api/tags')
        const data: { firstClass: { name: string }[]; custom: { name: string }[] } = await r.json()
        setAllTags([...(data.firstClass ?? []).map((t) => t.name), ...(data.custom ?? []).map((t) => t.name)])
      } catch {}
    }
    fetchTags()
  }, [])

  return <OnboardingFlow allTags={allTags} />
}
