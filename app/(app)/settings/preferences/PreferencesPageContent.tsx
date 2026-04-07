'use client'

import { useEffect, useState } from 'react'
import PreferencesForm from '@/components/preferences/PreferencesForm'

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
  // null = loading, 'member' = read-only, anything else = can manage
  const [householdRole, setHouseholdRole]   = useState<string | null>(null)
  const [roleLoaded, setRoleLoaded]         = useState(false)

  useEffect(() => {
    async function fetchTags() {
      try {
        const r = await fetch('/api/tags')
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

    async function fetchRole() {
      try {
        const r = await fetch('/api/household')
        if (r.ok) {
          const data = await r.json() as { myRole?: string }
          setHouseholdRole(data.myRole ?? null)
        }
      } catch {
        // If the request fails, treat as non-household user (full access)
      } finally {
        setRoleLoaded(true)
      }
    }

    void fetchTags()
    void fetchRole()
  }, [])

  const readOnly = roleLoaded && householdRole === 'member'

  return (
    <>
      {tagError && <p className="text-red-500 text-sm mt-2 px-4">{tagError}</p>}
      <PreferencesForm
        firstClassTags={firstClassTags}
        customTags={customTags}
        hiddenTags={hiddenTags}
        readOnly={readOnly}
      />
    </>
  )
}
