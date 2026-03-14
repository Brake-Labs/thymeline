'use client'

import { useEffect, useState } from 'react'
import PreferencesForm from '@/components/preferences/PreferencesForm'
import { getAccessToken } from '@/lib/supabase/browser'

export default function PreferencesPageContent() {
  const [allTags, setAllTags] = useState<string[]>([])

  useEffect(() => {
    async function fetchTags() {
      try {
        const r = await fetch('/api/tags', { headers: { Authorization: `Bearer ${await getAccessToken()}` } })
        const data: { firstClass: string[]; custom: { name: string }[] } = await r.json()
        setAllTags([...(data.firstClass ?? []), ...(data.custom ?? []).map((t) => t.name)])
      } catch {}
    }
    fetchTags()
  }, [])

  return <PreferencesForm allTags={allTags} />
}
