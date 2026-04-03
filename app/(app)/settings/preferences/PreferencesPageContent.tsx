'use client'

import { useEffect, useState } from 'react'
import PreferencesForm from '@/components/preferences/PreferencesForm'
import { getAccessToken } from '@/lib/supabase/browser'

type TagsResponse = {
  firstClass: { name: string; recipe_count: number }[]
  custom:     { name: string; section: string; recipe_count: number }[]
  hidden:     { name: string }[]
}

export default function PreferencesPageContent() {
  const [firstClassTags, setFirstClassTags] = useState<{ name: string; recipe_count: number }[]>([])
  const [customTags, setCustomTags]         = useState<{ name: string; section: string; recipe_count: number }[]>([])
  const [hiddenTags, setHiddenTags]         = useState<{ name: string }[]>([])
  const [tagError, setTagError]             = useState<string | null>(null)

  useEffect(() => {
    async function fetchTags() {
      try {
        const r = await fetch('/api/tags', { headers: { Authorization: `Bearer ${await getAccessToken()}` } })
        const data: TagsResponse = await r.json()
        setFirstClassTags(data.firstClass ?? [])
        setCustomTags(data.custom ?? [])
        setHiddenTags(data.hidden ?? [])
        setTagError(null)
      } catch (err) {
        setTagError('Something went wrong loading your tags.')
        console.error(err)
      }
    }
    fetchTags()
  }, [])

  return (
    <>
      {tagError && <p className="text-red-500 text-sm mt-2 px-4">{tagError}</p>}
      <PreferencesForm
        firstClassTags={firstClassTags}
        customTags={customTags}
        hiddenTags={hiddenTags}
      />
    </>
  )
}
