'use client'

import { useEffect, useState } from 'react'
import PreferencesForm from '@/components/preferences/PreferencesForm'
import { getAccessToken } from '@/lib/supabase/browser'

export default function PreferencesPageContent() {
  const [firstClassTags, setFirstClassTags] = useState<string[]>([])
  const [customTags, setCustomTags] = useState<{ name: string; section: string }[]>([])
  const [tagError, setTagError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTags() {
      try {
        const r = await fetch('/api/tags', { headers: { Authorization: `Bearer ${await getAccessToken()}` } })
        const data: { firstClass: string[]; custom: { name: string; section: string }[] } = await r.json()
        setFirstClassTags(data.firstClass ?? [])
        setCustomTags(data.custom ?? [])
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
      <PreferencesForm firstClassTags={firstClassTags} customTags={customTags} />
    </>
  )
}
